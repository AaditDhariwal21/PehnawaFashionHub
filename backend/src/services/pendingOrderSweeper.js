import PendingOrder from "../models/PendingOrder.js";
import squareClient from "./squareClient.js";
import { finalizePendingOrder } from "./orderCreation.js";
import { releasePromoReservation } from "./promoService.js";

/**
 * Closes out checkouts that were never paid.
 *
 * Why this exists: a Square payment link does not expire on its own. The
 * PendingOrder that holds the cart used to be deleted after 30 minutes by a
 * TTL index, so a customer who paid after that was charged and no order was
 * ever created — nothing was left to create it from.
 *
 * Now the PendingOrder is kept for 7 days, and every SWEEP_INTERVAL this job
 * looks at checkouts older than UNPAID_AFTER that it hasn't handled yet:
 *
 *   paid (per Square)  → the order is created now (finalizePendingOrder — the
 *                        same code the webhook and confirm endpoint run). This
 *                        also recovers orders whose webhook and confirmation
 *                        both failed.
 *   not paid           → the payment link is deleted so it can no longer be
 *                        paid, and any promo slot it held is released. The
 *                        record itself stays until the TTL, so a payment that
 *                        raced the deletion still becomes an order when its
 *                        webhook arrives.
 *
 * Single-instance assumption, like the rate limiter. Running on several
 * instances would be safe (finalizePendingOrder takes the processing lease and
 * deleting a link twice is harmless) but would do the work more than once.
 */

const MINUTE = 60 * 1000;
export const UNPAID_AFTER_MS = 60 * MINUTE;
const SWEEP_INTERVAL_MS = 10 * MINUTE;
const BATCH_SIZE = 25;

let running = false;

const deactivatePaymentLink = async (pending) => {
    try {
        await squareClient.checkout.paymentLinks.delete({ id: pending.paymentLinkId });
    } catch (error) {
        /* 404 = already gone, which is the state we want. Anything else is
           retried on the next sweep, because linkDeactivatedAt stays unset. */
        const status = error?.statusCode ?? error?.status;
        if (status !== 404) throw error;
    }
};

export const sweepUnpaidCheckouts = async () => {
    if (running) return { skipped: true };
    running = true;

    const summary = { recovered: 0, deactivated: 0, errors: 0 };

    try {
        const cutoff = new Date(Date.now() - UNPAID_AFTER_MS);
        const candidates = await PendingOrder.find({
            createdAt: { $lt: cutoff },
            linkDeactivatedAt: null,
        })
            .select("+guest.accessTokenHash")
            .sort({ createdAt: 1 })
            .limit(BATCH_SIZE);

        for (const pending of candidates) {
            try {
                const result = await finalizePendingOrder(pending, { trigger: "sweeper" });

                if (result.outcome === "created" || result.outcome === "exists") {
                    summary.recovered += 1;
                    console.warn(`[sweeper] Recovered paid checkout ${pending.squareOrderId} → order ${result.order.orderId}`);
                    continue;
                }

                if (result.outcome !== "not_paid") continue; // in progress / transient — next sweep

                await deactivatePaymentLink(pending);
                await PendingOrder.updateOne(
                    { _id: pending._id, linkDeactivatedAt: null },
                    { $set: { linkDeactivatedAt: new Date() } }
                );
                await releasePromoReservation({ squareOrderId: pending.squareOrderId });
                summary.deactivated += 1;
            } catch (error) {
                summary.errors += 1;
                console.error(`[sweeper] Failed on Square order ${pending.squareOrderId}:`, error?.message || error);
            }
        }
    } finally {
        running = false;
    }

    if (summary.recovered || summary.deactivated || summary.errors) {
        console.log(`[sweeper] recovered=${summary.recovered} deactivated=${summary.deactivated} errors=${summary.errors}`);
    }
    return summary;
};

export const startPendingOrderSweeper = () => {
    if (process.env.PENDING_ORDER_SWEEPER_ENABLED === "false") {
        console.log("[sweeper] Disabled by PENDING_ORDER_SWEEPER_ENABLED=false");
        return null;
    }
    const timer = setInterval(() => {
        sweepUnpaidCheckouts().catch((error) => console.error("[sweeper] Sweep failed:", error?.message || error));
    }, SWEEP_INTERVAL_MS);
    timer.unref();
    return timer;
};
