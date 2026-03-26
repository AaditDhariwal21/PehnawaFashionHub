import { WebhooksHelper } from "square";
import squareClient from "../services/squareClient.js";
import Product from "../models/Products.js";
import PendingOrder from "../models/PendingOrder.js";
import Order from "../models/Order.js";

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
        /* ── 6. Idempotency: check if order already exists ── */
        const existingOrder = await Order.findOne({
            "paymentResult.squarePaymentId": squarePaymentId,
        });
        if (existingOrder) {
            console.log(`[Webhook] Order already exists for payment ${squarePaymentId} — skipping.`);
            return res.status(200).send("OK");
        }

        /* ── 7. Find the PendingOrder ── */
        const pending = await PendingOrder.findOne({ squareOrderId });
        if (!pending) {
            console.warn(`[Webhook] No PendingOrder found for squareOrderId ${squareOrderId}`);
            return res.status(200).send("OK");
        }

        /* ── 8. Verify payment amount matches expected total ── */
        let squareOrderData;
        try {
            squareOrderData = await squareClient.orders.get({ orderId: squareOrderId });
        } catch (sqErr) {
            console.error(`[Webhook] Failed to fetch Square order ${squareOrderId}:`, sqErr.message);
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

        /* ── 9. Resolve products ── */
        const resolved = [];
        for (const ci of pending.cartItems) {
            const product = await Product.findById(ci.productId);
            if (!product) {
                console.error(`[Webhook] Product not found: ${ci.productId}`);
                return res.status(200).send("OK");
            }

            resolved.push({
                product,
                qty: ci.quantity,
                image: ci.image,
                size: ci.size || "",
            });
        }

        /* ── 10. Deduct stock atomically (race-condition safe) ── */
        const deducted = [];
        let stockFailed = false;

        for (const r of resolved) {
            let result;

            if (r.product.sizes && r.product.sizes.length > 0 && r.size) {
                result = await Product.updateOne(
                    {
                        _id: r.product._id,
                        sizes: { $elemMatch: { size: r.size, stock: { $gte: r.qty } } },
                    },
                    { $inc: { "sizes.$.stock": -r.qty, totalStock: -r.qty } }
                );
            } else if (r.product.totalStock != null) {
                result = await Product.updateOne(
                    { _id: r.product._id, totalStock: { $gte: r.qty } },
                    { $inc: { totalStock: -r.qty } }
                );
            } else {
                continue;
            }

            if (result.modifiedCount === 0) {
                console.error(`[Webhook] Stock race condition for "${r.product.name}" (${r.size || "no size"}).`);
                /* Rollback already-deducted items */
                for (const d of deducted) {
                    if (d.size) {
                        await Product.updateOne(
                            { _id: d.productId, "sizes.size": d.size },
                            { $inc: { "sizes.$.stock": d.qty, totalStock: d.qty } }
                        );
                    } else {
                        await Product.updateOne(
                            { _id: d.productId },
                            { $inc: { totalStock: d.qty } }
                        );
                    }
                }
                stockFailed = true;
                break;
            }

            deducted.push({ productId: r.product._id, size: r.size, qty: r.qty });
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
            size: r.size,
            price: r.product.price,
            quantity: r.qty,
        }));

        const order = await Order.create({
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
            shippingCost: pending.shippingCost,
            totalAmount: pending.totalAmount,
            orderStatus: "Paid",
            isPaid: true,
            paidAt: new Date(),
        });

        /* ── 12. Clean up pending order ── */
        await PendingOrder.deleteOne({ _id: pending._id });

        console.log(`[Webhook] Order ${order.orderId} created for payment ${squarePaymentId}`);
    } catch (err) {
        console.error("[Webhook] Error processing payment event:", err);
    }

    return res.status(200).send("OK");
};
