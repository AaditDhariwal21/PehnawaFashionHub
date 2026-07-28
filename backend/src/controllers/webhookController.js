import { WebhooksHelper } from "square";
import squareClient from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";
import { findVariant } from "../utils/variants.js";
import { confirmPromoRedemption } from "../services/promoService.js";
import {
    claimPendingOrder,
    findOrderBySquareOrderId,
    isDuplicateSquareOrderError,
    releasePendingOrderClaim,
    restoreStock,
} from "../services/orderCreation.js";

const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";
const WEBHOOK_URL = process.env.SQUARE_WEBHOOK_URL || "";

/* ══════════════════════════════════════════════════════════════
   POST /api/webhooks/square
   
   Receives webhook events from Square. The primary handler for
   payment.updated — creates orders automatically when payment
   is completed, regardless of user redirect behavior.
   ══════════════════════════════════════════════════════════════ */
export const handleSquareWebhook = async (req, res) => {
    /* ── 1. Always respond 200 quickly to prevent Square retries ── */
    const rawBody = req.body; // Buffer (express.raw middleware)
    const signature = req.headers["x-square-hmacsha256-signature"] || "";

    /* ── 2. Verify webhook signature ── */
    if (SIGNATURE_KEY && WEBHOOK_URL) {
        const isValid = WebhooksHelper.isValidWebhookEventSignature(
            rawBody.toString(),
            signature,
            SIGNATURE_KEY,
            WEBHOOK_URL
        );

        if (!isValid) {
            console.warn("[Webhook] Invalid signature — rejecting.");
            return res.status(200).send("OK"); // 200 to stop retries
        }
    } else {
        console.warn("[Webhook] Signature key or URL not configured — skipping verification.");
    }

    /* ── 3. Parse the event ── */
    let event;
    try {
        event = JSON.parse(rawBody.toString());
    } catch (err) {
        console.error("[Webhook] Failed to parse body:", err.message);
        return res.status(200).send("OK");
    }

    const eventType = event?.type;
    console.log(`[Webhook] Received event: ${eventType}`);

    /* ── 4. Only handle payment.updated ── */
    if (eventType !== "payment.updated" && eventType !== "payment.created") {
        return res.status(200).send("OK");
    }

    const payment = event?.data?.object?.payment;
    if (!payment) {
        console.warn("[Webhook] No payment object in event data.");
        return res.status(200).send("OK");
    }

    /* ── 5. Only process COMPLETED payments ── */
    if (payment.status !== "COMPLETED") {
        console.log(`[Webhook] Payment status is ${payment.status} — ignoring.`);
        return res.status(200).send("OK");
    }

    const squarePaymentId = payment.id;
    const squareOrderId = payment.order_id;

    if (!squareOrderId) {
        console.warn("[Webhook] Payment has no order_id — ignoring.");
        return res.status(200).send("OK");
    }

    try {
        /* ── 6. Idempotency: check if order already exists ──
           Keyed on squareOrderId, matching confirmPayment(). It used to key on
           squarePaymentId, which meant the two triggers consulted different
           fields and neither could be read as the definitive answer. */
        const existingOrder = await findOrderBySquareOrderId(squareOrderId);
        if (existingOrder) {
            console.log(`[Webhook] Order already exists for Square order ${squareOrderId} — skipping.`);
            return res.status(200).send("OK");
        }

        /* ── 7. Find the PendingOrder ── */
        const pending = await PendingOrder.findOne({ squareOrderId });
        if (!pending) {
            console.warn(`[Webhook] No PendingOrder found for squareOrderId ${squareOrderId}`);
            return res.status(200).send("OK");
        }

        /* ── 7b. Take the processing lease before doing any real work ──
           Square delivers both payment.created and payment.updated for a payment
           link, commonly both COMPLETED, and the customer's confirm request
           arrives around the same time. The check above cannot separate them:
           everything from here to Order.create takes long enough that several
           triggers would all pass it. Claiming here means only one does the
           Square call and the stock deduction. */
        const claimed = await claimPendingOrder(pending._id);
        if (!claimed) {
            console.log(`[Webhook] Square order ${squareOrderId} is already being processed — skipping.`);
            return res.status(200).send("OK");
        }

        /* ── 8. Verify payment amount matches expected total ── */
        let squareOrderData;
        try {
            squareOrderData = await squareClient.orders.get({ orderId: squareOrderId });
        } catch (sqErr) {
            console.error(`[Webhook] Failed to fetch Square order ${squareOrderId}:`, sqErr.message);
            /* Transient — release the lease so Square's redelivery (or the
               customer's confirm request) can pick this up immediately. */
            await releasePendingOrderClaim(pending._id);
            return res.status(200).send("OK");
        }

        const paidAmountCents = Number(squareOrderData.order?.totalMoney?.amount ?? 0);
        const expectedCents = Math.round(pending.totalAmount * 100);

        if (Math.abs(paidAmountCents - expectedCents) > 1) {
            console.error(
                `[Webhook] Amount mismatch for ${squareOrderId}: Square=${paidAmountCents}¢, expected=${expectedCents}¢ — skipping order creation.`
            );
            return res.status(200).send("OK");
        }

        /* ── 9. Resolve products + variants ── */
        const resolved = [];
        for (const ci of pending.cartItems) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                console.error(`[Webhook] Product not found: ${ci.productId}`);
                return res.status(200).send("OK");
            }

            const variant = findVariant(product, ci.color, ci.size);
            if (!variant) {
                console.error(`[Webhook] Variant ${ci.color}/${ci.size} not found for ${product.name}`);
                return res.status(200).send("OK");
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

        /* ── 10. Deduct stock atomically (race-condition safe) ── */
        const deducted = [];
        let stockFailed = false;

        for (const r of resolved) {
            const result = await Product.updateOne(
                {
                    _id: r.product._id,
                    variants: {
                        $elemMatch: {
                            color: r.color,
                            size: r.size,
                            stock: { $gte: r.qty },
                        },
                    },
                },
                { $inc: { "variants.$.stock": -r.qty } }
            );

            if (result.modifiedCount === 0) {
                console.error(`[Webhook] Stock race condition for "${r.product.name}" (${r.color} / ${r.size}).`);
                for (const d of deducted) {
                    await Product.updateOne(
                        {
                            _id: d.productId,
                            variants: { $elemMatch: { color: d.color, size: d.size } },
                        },
                        { $inc: { "variants.$.stock": d.qty } }
                    );
                }
                stockFailed = true;
                break;
            }

            deducted.push({ productId: r.product._id, color: r.color, size: r.size, qty: r.qty });
        }

        if (stockFailed) {
            console.error(`[Webhook] Order skipped due to insufficient stock (squareOrderId: ${squareOrderId}).`);
            return res.status(200).send("OK");
        }

        /* ── 11. Create the order ── */
        const orderItems = resolved.map((r) => ({
            productId: r.product._id,
            name: r.product.name,
            image: r.image,
            color: r.color,
            size: r.size,
            price: r.price,
            quantity: r.qty,
        }));

        let order;
        try {
            order = await Order.create({
                user: pending.userId,
                items: orderItems,
                shippingAddress: pending.shippingAddress,
                paymentMethod: "Square",
                paymentResult: {
                    squareOrderId,
                    squarePaymentId,
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
            /* Backstop fired, or the insert failed for some other reason. Either
               way stock has already been deducted for an order that does not
               exist, so give it back before bailing out. */
            await restoreStock(resolved);

            if (isDuplicateSquareOrderError(createErr)) {
                console.log(`[Webhook] Order for Square order ${squareOrderId} already created by another trigger — stock restored, skipping.`);
            } else {
                /* Not a duplicate payment — a genuine failure. Release the lease
                   so Square's redelivery can retry rather than waiting it out. */
                console.error(`[Webhook] Order creation failed for ${squareOrderId} — stock restored:`, createErr);
                await releasePendingOrderClaim(pending._id);
            }
            return res.status(200).send("OK");
        }

        /* ── 12. Promote the promo reservation to a confirmed redemption.
           Idempotent — confirmPayment() races this handler for the same order
           and whichever arrives second is a no-op. */
        await confirmPromoRedemption({
            squareOrderId,
            orderId: order._id,
        });

        /* ── 13. Clean up pending order ── */
        await PendingOrder.deleteOne({ _id: pending._id });

        console.log(`[Webhook] Order ${order.orderId} created for payment ${squarePaymentId}`);
    } catch (err) {
        console.error("[Webhook] Error processing payment event:", err);
    }

    return res.status(200).send("OK");
};
