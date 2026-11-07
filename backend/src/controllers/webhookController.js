import { WebhooksHelper } from "square";
import PendingOrder from "../models/PendingOrder.js";
import {
    finalizePendingOrder,
    findOrderBySquareOrderId,
} from "../services/orderCreation.js";
import { applyOrderStock } from "../services/inventory.js";

/* ══════════════════════════════════════════════════════════════
   POST /api/webhooks/square

   Receives webhook events from Square. Creates the order when a
   payment completes, regardless of whether the customer ever comes
   back to the site.

   Two independent defences against a forged "payment completed"
   message (this URL is public, so anyone can send one):

   1. The signature. Square signs every event with a key only Square
      and this server hold. Unsigned or wrongly signed events are
      dropped. This used to be skipped whenever the key wasn't
      configured; it now fails closed.

   2. Nothing in the event body is believed. The event only says
      "go and check order X". finalizePendingOrder() then asks Square
      directly whether that order has a completed payment for the
      right amount (verifySquarePayment). So even a correctly signed
      event cannot create an order that wasn't paid for.
   ══════════════════════════════════════════════════════════════ */
export const handleSquareWebhook = async (req, res) => {
    const rawBody = req.body; // Buffer (express.raw middleware)
    const signature = req.headers["x-square-hmacsha256-signature"] || "";

    /* Read per request: see the note on frontendUrl() in paymentController. */
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";
    const webhookUrl = process.env.SQUARE_WEBHOOK_URL || "";

    /* ── 1. Verify webhook signature — fail closed ── */
    if (!signatureKey || !webhookUrl) {
        console.error("[Webhook] SQUARE_WEBHOOK_SIGNATURE_KEY / SQUARE_WEBHOOK_URL not configured — rejecting event.");
        /* 503 rather than 200: Square retries, so events received while the
           configuration is missing are delivered again once it is fixed.
           Orders are still created meanwhile by the customer's confirmation
           page. */
        return res.status(503).send("Webhook verification not configured");
    }

    let isValid = false;
    try {
        isValid = await WebhooksHelper.verifySignature({
            requestBody: Buffer.isBuffer(rawBody) ? rawBody.toString() : String(rawBody ?? ""),
            signatureHeader: signature,
            signatureKey,
            notificationUrl: webhookUrl,
        });
    } catch (error) {
        console.warn("[Webhook] Signature verification error:", error?.message);
        isValid = false;
    }

    if (!isValid) {
        console.warn("[Webhook] Invalid signature — rejecting.");
        return res.status(200).send("OK"); // 200 to stop retries
    }

    /* ── 2. Parse the event ── */
    let event;
    try {
        event = JSON.parse(rawBody.toString());
    } catch (err) {
        console.error("[Webhook] Failed to parse body:", err.message);
        return res.status(200).send("OK");
    }

    const eventType = event?.type;
    console.log(`[Webhook] Received event: ${eventType}`);

    /* ── 3. Only payment events are relevant ── */
    if (eventType !== "payment.updated" && eventType !== "payment.created") {
        return res.status(200).send("OK");
    }

    const payment = event?.data?.object?.payment;
    if (!payment) {
        console.warn("[Webhook] No payment object in event data.");
        return res.status(200).send("OK");
    }

    /* A cheap filter only — the real check is verifySquarePayment(). */
    if (payment.status !== "COMPLETED") {
        console.log(`[Webhook] Payment status is ${payment.status} — ignoring.`);
        return res.status(200).send("OK");
    }

    const squareOrderId = typeof payment.order_id === "string" ? payment.order_id : "";
    if (!squareOrderId) {
        console.warn("[Webhook] Payment has no order_id — ignoring.");
        return res.status(200).send("OK");
    }

    try {
        /* ── 4. Idempotency: order already exists? ──
           Repair a missed stock application if so — a no-op when the order's
           inventory ledger is already claimed, which is the norm. This is what
           makes Square's redelivery a self-healing retry. */
        const existingOrder = await findOrderBySquareOrderId(squareOrderId);
        if (existingOrder) {
            console.log(`[Webhook] Order already exists for Square order ${squareOrderId} — skipping.`);
            await applyOrderStock(existingOrder);
            return res.status(200).send("OK");
        }

        /* ── 5. Find the PendingOrder ── */
        const pending = await PendingOrder.findOne({ squareOrderId }).select("+guest.accessTokenHash");
        if (!pending) {
            console.warn(`[Webhook] No PendingOrder found for squareOrderId ${squareOrderId}`);
            return res.status(200).send("OK");
        }

        /* ── 6. Verify with Square and create the order ── */
        const result = await finalizePendingOrder(pending, { trigger: "webhook" });

        if (result.outcome === "created") {
            console.log(`[Webhook] Order ${result.order.orderId} created for Square order ${squareOrderId}`);
        } else if (result.outcome === "in_progress") {
            console.log(`[Webhook] Square order ${squareOrderId} is already being processed — skipping.`);
        } else if (result.outcome === "not_paid") {
            console.warn(`[Webhook] Square reports no completed payment for order ${squareOrderId} (${result.detail || ""}) — no order created.`);
        }
    } catch (err) {
        console.error("[Webhook] Error processing payment event:", err?.message || err);
    }

    return res.status(200).send("OK");
};
