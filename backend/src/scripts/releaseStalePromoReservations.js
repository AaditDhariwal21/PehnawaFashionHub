/**
 * Reclaim promo usage slots from checkouts the customer abandoned on Square's
 * hosted payment page.
 *
 * Run with:
 *   node src/scripts/releaseStalePromoReservations.js
 *
 * A reservation is taken when the discounted Square payment link is created,
 * and confirmed when the resulting order is created. If the customer never
 * pays, PendingOrder disappears via its 30-minute TTL index — and because TTL
 * deletion fires no application hook, nothing would otherwise hand the slot
 * back. On a limited code ("first 100 customers"), leaked slots would
 * eventually make it look fully claimed while nobody has actually redeemed it.
 *
 * The validation path already sweeps opportunistically, so this script is not
 * required for correctness — it exists for a scheduled belt-and-braces run and
 * for reclaiming slots on a code nobody is currently trying to apply.
 *
 * Idempotent and safe to re-run; only reservations older than the service's
 * staleness threshold (45 minutes, comfortably past the PendingOrder TTL) are
 * touched.
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { releaseStaleReservations } from "../services/promoService.js";

const run = async () => {
    await connectDB();

    /* releaseStaleReservations() processes at most 200 per call to keep the
       hot-path version bounded; loop here until a pass finds nothing. */
    let total = 0;
    for (;;) {
        const released = await releaseStaleReservations();
        if (released === 0) break;
        total += released;
        console.log(`  ✓ released ${released} stale reservation(s)`);
    }

    console.log(`\nDone. Released ${total} stale reservation(s).`);
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error("Stale reservation sweep failed:", err);
    process.exit(1);
});
