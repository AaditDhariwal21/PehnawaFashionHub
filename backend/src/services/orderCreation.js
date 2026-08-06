import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";

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
