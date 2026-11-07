import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import Product from "../models/Products.js";
import Cart from "../models/Cart.js";
import squareClient from "./squareClient.js";
import { applyOrderStock } from "./inventory.js";
import { confirmPromoRedemption } from "./promoService.js";
import { findVariant } from "../utils/variants.js";
import { guestLinkExpiry } from "../utils/guestAccess.js";

/**
 * Concurrency safety for order creation.
 *
 * An order can be created by three concurrent triggers for a single payment:
 *   · POST /api/payments/confirm (and its two aliases) when the customer lands
 *     back on the confirmation page
 *   · the Square payment.created webhook
 *   · the Square payment.updated webhook
 * For a payment-link checkout Square commonly delivers BOTH webhook events with
 * status COMPLETED, so webhook-versus-webhook is at least as likely as
 * webhook-versus-confirm.
 *
 * Each trigger previously ran a findOne duplicate check and then several
 * hundred milliseconds of work — a Square API round-trip, N product lookups,
 * N stock decrements — before inserting. Two triggers could therefore both pass
 * the check before either inserted, producing two orders for one payment and
 * decrementing inventory twice.
 *
 * The fix is two independent layers:
 *
 *   1. A short lease on the PendingOrder, taken BEFORE any of that work
 *      (claimPendingOrder). Losing the lease costs nothing — the loser stops
 *      immediately, having made no Square call and touched no stock. This is
 *      what actually prevents the double deduction, rather than compensating
 *      for it afterwards.
 *
 *   2. A unique partial index on Order.paymentResult.squareOrderId (declared in
 *      models/Order.js). This enforces "one order per Square order" in the
 *      database itself, covering anything the lease can't: a stale lease being
 *      re-taken while the original worker is still alive, direct database
 *      writes, and future code paths.
 *
 *   3. The inventory ledger on the order document itself — `stockApplied`,
 *      claimed atomically by applyOrderStock() in services/inventory.js. Stock
 *      is written only AFTER the order insert has picked a winner, and only by
 *      whoever wins that claim, so a loser has deducted nothing and there is no
 *      compensating restore to get wrong. This module used to export a
 *      restoreStock() for exactly that undo; it is gone, along with the window
 *      where a crash between deducting and inserting stranded inventory.
 *
 * Note all three layers are single atomic database operations, not
 * check-then-act.
 */

/**
 * How long a trigger may hold a PendingOrder before another is allowed to take
 * over. The work involved is one Square call plus a handful of updates, so this
 * is already generous — but it is deliberately kept short rather than very long,
 * because a lease left behind by a crashed worker blocks legitimate retries
 * (Square redelivers webhooks within seconds, and the confirm endpoint tells the
 * customer to try again when payment hasn't settled yet).
 *
 * Keeping it short means a slow trigger can occasionally be overtaken and two
 * will run concurrently. That is safe rather than harmful: the unique index on
 * Order.paymentResult.squareOrderId rejects the second insert and the loser
 * restores its stock. Wasted work, correct outcome — the right trade against
 * stranding a paid checkout.
 */
const PROCESSING_LEASE_MS = 20 * 1000;

/**
 * Take the processing lease on a PendingOrder.
 *
 * @returns the claimed document, or null if another trigger currently holds it.
 */
export const claimPendingOrder = async (pendingOrderId) => {
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - PROCESSING_LEASE_MS);

    return PendingOrder.findOneAndUpdate(
        {
            _id: pendingOrderId,
            $or: [
                { processingStartedAt: null },
                { processingStartedAt: { $exists: false } },
                /* Previous holder died mid-flight — the lease has expired. */
                { processingStartedAt: { $lt: staleCutoff } },
            ],
        },
        { $set: { processingStartedAt: now } },
        { new: true }
    );
};

/**
 * Give the lease back when a trigger claimed a checkout but then stopped without
 * creating an order — Square hasn't settled the payment yet, the API call
 * failed, and so on. Without this the lease would sit until it expired and block
 * the very retry those paths are asking for.
 *
 * Only ever called when no order was created; once one exists the PendingOrder
 * is deleted and the lease is moot.
 */
export const releasePendingOrderClaim = (pendingOrderId) =>
    PendingOrder.updateOne(
        { _id: pendingOrderId },
        { $set: { processingStartedAt: null } }
    );

/**
 * The single identity field both triggers use to decide whether an order
 * already exists. Previously confirmPayment() keyed on squareOrderId while the
 * webhook keyed on squarePaymentId, so neither could be read as the definitive
 * answer. Everything goes through here now.
 */
export const findOrderBySquareOrderId = (squareOrderId) =>
    Order.findOne({ "paymentResult.squareOrderId": squareOrderId });

/**
 * True when an insert was rejected specifically by the unique index on
 * paymentResult.squareOrderId — i.e. layer 2 fired and another trigger really
 * did already create this order.
 *
 * The distinction matters. Order has two unique indexes, and treating any
 * duplicate-key error as "another trigger won" would misclassify an orderId
 * collision: the caller would look for the winning order, find none, and report
 * the payment as still processing while the customer's paid order was never
 * created at all. Mongo reports which index rejected the write in keyPattern,
 * so the two are told apart rather than guessed at.
 */
export const isDuplicateSquareOrderError = (error) => {
    if (error?.code !== 11000) return false;
    return Object.keys(error.keyPattern ?? {}).includes("paymentResult.squareOrderId");
};

/** True for any duplicate-key rejection, whichever index it came from. */
export const isDuplicateKeyError = (error) => error?.code === 11000;

/**
 * Wait briefly for the trigger that holds the lease to finish, so a customer
 * whose request lost the race still gets their order rather than an error.
 *
 * Bounded and short. This only runs on the user-facing confirm endpoint, which
 * the frontend reaches solely after 15 seconds of polling latest-paid has
 * already failed, so it is a rare last resort rather than a normal wait.
 */
export const waitForOrderBySquareOrderId = async (
    squareOrderId,
    { attempts = 8, intervalMs = 500 } = {}
) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const order = await findOrderBySquareOrderId(squareOrderId);
        if (order) return order;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return findOrderBySquareOrderId(squareOrderId);
};

/* ══════════════════════════════════════════════════════════════
   Payment verification
   ══════════════════════════════════════════════════════════════ */

/**
 * Ask Square, directly, whether the checkout behind a PendingOrder has
 * actually been paid in full. Nothing a caller was told (a webhook body, a
 * redirect, a client request) is taken as evidence of payment; only Square's
 * own records are.
 *
 * Previously the webhook path trusted `payment.status` from the event body and
 * checked only the order's total price, which is fixed when the payment link
 * is created and is the same whether or not anyone paid. A forged "payment
 * completed" event for an unpaid checkout would have passed it.
 *
 * Paid means all of:
 *   · the Square order has at least one tender (a payment attached),
 *   · the payment behind it reports status COMPLETED and belongs to this order,
 *   · the order total equals what we expected to charge (±1¢ rounding).
 *
 * @returns {Promise<
 *   {ok: true, squarePaymentId: string} |
 *   {ok: false, reason: "not_paid"|"amount_mismatch"|"square_error", detail?: string}
 * >}
 */
export const verifySquarePayment = async (pending) => {
    let squareOrder;
    try {
        const response = await squareClient.orders.get({ orderId: pending.squareOrderId });
        squareOrder = response.order;
    } catch (error) {
        return { ok: false, reason: "square_error", detail: error?.message };
    }

    const tenders = squareOrder?.tenders || [];
    if (tenders.length === 0) return { ok: false, reason: "not_paid", detail: "no tenders" };

    const paidAmountCents = Number(squareOrder.totalMoney?.amount ?? 0);
    const expectedCents = Math.round(pending.totalAmount * 100);
    if (Math.abs(paidAmountCents - expectedCents) > 1) {
        return {
            ok: false,
            reason: "amount_mismatch",
            detail: `Square order total ${paidAmountCents}¢, expected ${expectedCents}¢`,
        };
    }

    const squarePaymentId = tenders[0]?.paymentId || tenders[0]?.id || "";
    if (!squarePaymentId) return { ok: false, reason: "not_paid", detail: "tender without payment id" };

    let payment;
    try {
        const response = await squareClient.payments.get({ paymentId: squarePaymentId });
        payment = response.payment;
    } catch (error) {
        return { ok: false, reason: "square_error", detail: error?.message };
    }

    if (payment?.status !== "COMPLETED") {
        return { ok: false, reason: "not_paid", detail: `payment status ${payment?.status ?? "unknown"}` };
    }
    if (payment.orderId && payment.orderId !== pending.squareOrderId) {
        return { ok: false, reason: "not_paid", detail: "payment belongs to a different order" };
    }

    return { ok: true, squarePaymentId };
};

/* ══════════════════════════════════════════════════════════════
   PendingOrder → Order
   ══════════════════════════════════════════════════════════════ */

/**
 * Remove the purchased lines from a logged-in buyer's saved cart.
 *
 * Done here, as part of order creation, rather than by the confirmation page,
 * so the cart is right even when the webhook created the order and the
 * customer never came back to the site. Buy Now purchases leave the cart
 * alone. Never allowed to fail the order.
 */
const removePurchasedLinesFromCart = async (pending) => {
    if (!pending.userId || pending.source === "buyNow") return;
    try {
        const lines = (pending.cartItems || []).map((ci) => ({
            productId: ci.productId,
            color: ci.color || "",
            size: ci.size || "",
        }));
        if (lines.length === 0) return;
        await Cart.updateOne(
            { user: pending.userId },
            { $pull: { items: { $or: lines } } }
        );
    } catch (error) {
        console.error(`[orderCreation] Could not clear cart lines for Square order ${pending.squareOrderId}:`, error.message);
    }
};

/**
 * Turn a PendingOrder into an Order if, and only if, Square confirms it has
 * been paid. The one implementation shared by every trigger (the customer's
 * confirm request, the Square webhooks and the pending-order sweeper) so they
 * cannot drift apart. The confirm and webhook handlers each used to carry
 * their own copy of these steps.
 *
 * The concurrency layers are unchanged and still apply in this order:
 * processing lease → unique index on paymentResult.squareOrderId → the
 * order's own stockApplied ledger. See the header of this module.
 *
 * Callers must load `pending` with `+guest.accessTokenHash` selected when it
 * may be a guest checkout, so the guest's link carries over to the order.
 *
 * @returns {Promise<
 *   {outcome: "created", order, fulfillmentHold: boolean} |
 *   {outcome: "exists", order} |
 *   {outcome: "in_progress"} |
 *   {outcome: "not_paid"|"amount_mismatch"|"square_error", detail?: string} |
 *   {outcome: "product_missing", message: string}
 * >}
 */
export const finalizePendingOrder = async (pending, { trigger = "unknown" } = {}) => {
    /* ── 1. Already created by another trigger? ── */
    const existingOrder = await findOrderBySquareOrderId(pending.squareOrderId);
    if (existingOrder) {
        /* Finish the job if whoever created it died before applying stock.
           applyOrderStock is a no-op once the order's ledger is claimed. */
        await applyOrderStock(existingOrder);
        await PendingOrder.deleteOne({ _id: pending._id });
        return { outcome: "exists", order: existingOrder };
    }

    /* ── 2. Processing lease, before any real work ── */
    const claimed = await claimPendingOrder(pending._id);
    if (!claimed) return { outcome: "in_progress" };

    /* ── 3. Verify the payment with Square itself ── */
    const verification = await verifySquarePayment(pending);
    if (!verification.ok) {
        /* Every bail-out hands the lease back, so the retry these outcomes
           invite (Square's redelivery, the customer's next confirm, the next
           sweep) isn't blocked waiting for it to expire. */
        await releasePendingOrderClaim(pending._id);
        if (verification.reason !== "not_paid") {
            console.error(`[orderCreation:${trigger}] ${verification.reason} for Square order ${pending.squareOrderId}: ${verification.detail || ""}`);
        }
        return { outcome: verification.reason, detail: verification.detail };
    }

    /* ── 4. Resolve products + variant prices ── */
    const resolved = [];
    for (const ci of pending.cartItems) {
        const product = await Product.findById(ci.productId);
        if (!product) {
            await releasePendingOrderClaim(pending._id);
            console.error(`[orderCreation:${trigger}] Product not found: ${ci.productId} (Square order ${pending.squareOrderId})`);
            return { outcome: "product_missing", message: `Product not found: ${ci.productId}` };
        }

        const variant = findVariant(product, ci.color, ci.size);
        if (!variant) {
            await releasePendingOrderClaim(pending._id);
            console.error(`[orderCreation:${trigger}] Variant ${ci.color}/${ci.size} not found for ${product._id} (Square order ${pending.squareOrderId})`);
            return {
                outcome: "product_missing",
                message: `Variant ${ci.color} / ${ci.size} no longer exists for "${product.name}".`,
            };
        }

        resolved.push({
            product,
            qty: ci.quantity,
            price: variant.price,
            image: ci.image,
            color: ci.color || "",
            size: ci.size || "",
        });
    }

    /* ── 5. Create the order ──
       Before the stock is touched, not after. The unique index on
       paymentResult.squareOrderId makes this insert the single point at which
       one trigger is chosen for this payment; the loser deducts nothing and so
       has nothing to compensate. */
    const orderItems = resolved.map((r) => ({
        productId: r.product._id,
        name: r.product.name,
        image: r.image,
        color: r.color,
        size: r.size,
        price: r.price,
        quantity: r.qty,
    }));

    const isGuest = !!pending.isGuest;

    let order;
    try {
        order = await Order.create({
            ...(isGuest ? {} : { user: pending.userId }),
            isGuest,
            ...(pending.contactEmail ? { contactEmail: pending.contactEmail } : {}),
            ...(isGuest
                ? {
                    guest: {
                        emailKey: pending.guest?.emailKey,
                        accessTokenHash: pending.guest?.accessTokenHash,
                        accessTokenExpiresAt: guestLinkExpiry(),
                    },
                }
                : {}),
            items: orderItems,
            shippingAddress: pending.shippingAddress,
            paymentMethod: "Square",
            paymentResult: {
                squareOrderId: pending.squareOrderId,
                squarePaymentId: verification.squarePaymentId,
                status: "COMPLETED",
            },
            subtotal: pending.subtotal,
            discountAmount: pending.discountAmount || 0,
            promo: pending.promo?.code ? pending.promo : undefined,
            shippingCost: pending.shippingCost,
            totalAmount: pending.totalAmount,
            orderStatus: "Paid",
            isPaid: true,
            paidAt: new Date(),
        });
    } catch (createErr) {
        /* No stock has been touched, so there is nothing to give back.

           Backstop fired: the unique index on paymentResult.squareOrderId
           rejected this insert because another trigger got there first,
           despite the lease. Deliberately narrow: a collision on the orderId
           index is a real fault, not a duplicate payment. */
        if (isDuplicateSquareOrderError(createErr)) {
            const winner = await findOrderBySquareOrderId(pending.squareOrderId);
            await PendingOrder.deleteOne({ _id: pending._id });
            if (winner) {
                await applyOrderStock(winner);
                return { outcome: "exists", order: winner };
            }
            return { outcome: "in_progress" };
        }

        await releasePendingOrderClaim(pending._id);
        throw createErr;
    }

    /* ── 6. Apply the stock decrements ──
       A shortfall does not fail the order: the payment is captured, so the
       order stands and is flagged for admin review. */
    const stockResult = await applyOrderStock(order);

    /* ── 7. Promote the promo reservation. Idempotent across triggers. ── */
    await confirmPromoRedemption({
        squareOrderId: pending.squareOrderId,
        orderId: order._id,
    });

    /* ── 8. Saved cart, then clean-up ── */
    await removePurchasedLinesFromCart(pending);
    await PendingOrder.deleteOne({ _id: pending._id });

    return {
        outcome: "created",
        order,
        fulfillmentHold: stockResult.shortfalls.length > 0,
    };
};
