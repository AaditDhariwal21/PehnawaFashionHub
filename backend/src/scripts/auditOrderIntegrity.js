/**
 * Read-only forensic audit of the orders collection. Safe to run against
 * production.
 *
 * Run with (production):
 *   node src/scripts/auditOrderIntegrity.js --uri="mongodb+srv://…/pehnawa"
 *
 * Or against whatever MONGO_URI is in .env (i.e. dev):
 *   node src/scripts/auditOrderIntegrity.js
 *
 * Passing --uri bypasses .env entirely. The database name is printed on
 * connect — check it before trusting the output.
 *
 * This script performs NO writes. It deliberately talks to raw collections
 * rather than importing the Mongoose models, so it cannot trigger index builds,
 * schema migrations or pre-save hooks against a live database.
 *
 * ── Section 1: was the unverified legacy POST /api/orders ever used? ──
 *
 * That endpoint (removed in the commit that added this script) set
 * orderStatus "Paid", isPaid true and decremented inventory with no payment
 * verification at all. Access logs can't answer whether it was hit — morgan
 * writes to stdout and nothing aggregates it — so this reconstructs the answer
 * from the data.
 *
 * Only three code paths ever created an Order: the legacy endpoint,
 * confirmPayment(), and the Square webhook. The latter two always write
 *     paymentResult: { squareOrderId, squarePaymentId, status: "COMPLETED" }
 * while the legacy one wrote no paymentResult at all. So a PAID order with no
 * squareOrderId came from the legacy endpoint — or from before Square was
 * integrated. The first verified Square order separates those two cases.
 *
 * ── Section 2: has the confirmPayment/webhook race already produced duplicates? ──
 *
 * Both paths do a check-then-act duplicate test and then several hundred
 * milliseconds of async work (a Square round-trip, N product lookups, N stock
 * decrements) before Order.create. Square fires the webhook at roughly the
 * moment it redirects the customer, so both can pass their check before either
 * inserts. This counts how often one payment produced more than one order.
 *
 * Exit code is 1 if either section finds something needing attention, 0 if clean.
 */

import mongoose from "mongoose";

/* --uri wins outright; otherwise fall back to .env (dev). */
const uriArg = process.argv.find((a) => a.startsWith("--uri="));
const explicitUri = uriArg ? uriArg.slice("--uri=".length) : null;

if (!explicitUri) {
    const dotenv = await import("dotenv");
    dotenv.default.config({ quiet: true });
}

const uri = explicitUri || process.env.MONGO_URI;
if (!uri) {
    console.error("No connection string. Pass --uri=… or set MONGO_URI in .env.");
    process.exit(1);
}

const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const iso = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) : "—");

await mongoose.connect(uri);
const db = mongoose.connection.db;
const orders = db.collection("orders");

console.log(`\nDatabase: ${db.databaseName}   (read-only audit)`);
console.log("=".repeat(78));

let problems = 0;

/* ══════════════════════════════════════════════════════════════
   SECTION 1 — unverified legacy orders
   ══════════════════════════════════════════════════════════════ */

console.log("\nSECTION 1  Legacy POST /api/orders usage\n");

const missingSquareRef = {
    $or: [
        { "paymentResult.squareOrderId": { $exists: false } },
        { "paymentResult.squareOrderId": null },
        { "paymentResult.squareOrderId": "" },
    ],
};

const total = await orders.countDocuments({});
const verified = await orders.countDocuments({
    "paymentResult.squareOrderId": { $exists: true, $nin: [null, ""] },
});
const unverifiedPaid = await orders
    .find({ isPaid: true, ...missingSquareRef })
    .project({ orderId: 1, user: 1, items: 1, subtotal: 1, shippingCost: 1, totalAmount: 1, createdAt: 1, orderStatus: 1, paymentResult: 1 })
    .sort({ createdAt: 1 })
    .toArray();

console.log(`  Total orders                       : ${total}`);
console.log(`  With a Square reference (verified) : ${verified}`);
console.log(`  PAID with NO Square reference      : ${unverifiedPaid.length}`);

if (unverifiedPaid.length === 0) {
    console.log("\n  -> No evidence the legacy endpoint ever created an order. Clean.");
} else {
    /* Anything created after Square went live can't be pre-integration data. */
    const firstVerified = await orders
        .find({ "paymentResult.squareOrderId": { $exists: true, $nin: [null, ""] } })
        .project({ createdAt: 1 })
        .sort({ createdAt: 1 })
        .limit(1)
        .toArray();

    const cutoff = firstVerified.length ? new Date(firstVerified[0].createdAt) : null;
    const afterCutoff = cutoff
        ? unverifiedPaid.filter((o) => new Date(o.createdAt) > cutoff)
        : unverifiedPaid;

    console.log("\n  orderId                  created              total      status");
    console.log("  " + "-".repeat(70));
    for (const o of unverifiedPaid) {
        const flag = cutoff && new Date(o.createdAt) > cutoff ? "  <-- AFTER Square went live" : "";
        console.log(
            `  ${String(o.orderId ?? "(none)").padEnd(24)} ${iso(o.createdAt).padEnd(20)} ` +
            `${money(o.totalAmount).padEnd(10)} ${String(o.orderStatus ?? "?").padEnd(10)}${flag}`
        );
    }

    console.log(`\n  First verified Square order: ${cutoff ? iso(cutoff) : "none exist"}`);

    if (afterCutoff.length === 0) {
        console.log("  -> All of them predate Square integration: legacy data, not endpoint abuse. Clean.");
    } else {
        problems += afterCutoff.length;
        const exposure = afterCutoff.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);
        const units = afterCutoff.reduce(
            (s, o) => s + (o.items ?? []).reduce((n, i) => n + Number(i.quantity ?? 0), 0), 0
        );

        console.log("\n  *** INCIDENT: orders marked paid with no payment, created while Square was live. ***");
        console.log(`      count ${afterCutoff.length}   value ${money(exposure)}   units of stock drawn down ${units}\n`);

        for (const o of afterCutoff) {
            console.log(`      ${o.orderId}   user=${o.user}   ${money(o.totalAmount)}   ${iso(o.createdAt)}`);
            for (const i of o.items ?? []) {
                console.log(`         ${i.quantity} x ${i.name} (${i.color || "—"}/${i.size || "—"}) @ ${money(i.price)}`);
            }
        }
        console.log("\n      These shipped goods against no payment. Investigate the accounts");
        console.log("      involved and reconcile inventory before closing this out.");
    }
}

/* Independent tell: the legacy endpoint trusted shippingCost from the request
   body and accepted any positive number. */
const oddShipping = await orders
    .find({ $or: [{ shippingCost: { $lte: 0 } }, { shippingCost: { $gt: 0, $lt: 1 } }] })
    .project({ orderId: 1, shippingCost: 1, createdAt: 1 })
    .toArray();

console.log(`\n  Orders with shippingCost <= $0 or under $1: ${oddShipping.length}`);
for (const o of oddShipping) {
    problems += 1;
    console.log(`    ${o.orderId}  shippingCost=${o.shippingCost}  ${iso(o.createdAt)}`);
}

/* ══════════════════════════════════════════════════════════════
   SECTION 2 — duplicate orders from the confirm/webhook race
   ══════════════════════════════════════════════════════════════ */

console.log("\n" + "=".repeat(78));
console.log("\nSECTION 2  Duplicate orders per payment (confirmPayment vs webhook race)\n");

const dupesBy = async (field) => {
    const rows = await orders
        .aggregate([
            { $match: { [field]: { $exists: true, $nin: [null, ""] } } },
            {
                $group: {
                    _id: `$${field}`,
                    count: { $sum: 1 },
                    orderIds: { $push: "$orderId" },
                    createdAts: { $push: "$createdAt" },
                    totals: { $push: "$totalAmount" },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } },
        ])
        .toArray();
    return rows;
};

for (const field of ["paymentResult.squareOrderId", "paymentResult.squarePaymentId"]) {
    const rows = await dupesBy(field);
    console.log(`  Duplicate groups on ${field}: ${rows.length}`);

    for (const r of rows) {
        problems += r.count - 1;
        const gapMs = Math.max(...r.createdAts.map((d) => +new Date(d))) -
                      Math.min(...r.createdAts.map((d) => +new Date(d)));
        console.log(`\n    ${r._id}  ->  ${r.count} orders, created ${gapMs}ms apart`);
        r.orderIds.forEach((id, i) => {
            console.log(`      ${id}   ${iso(r.createdAts[i])}   ${money(r.totals[i])}`);
        });
        console.log("      Stock was decremented once per order here — reconcile the extra.");
    }
}

/* Orders whose paymentResult is only half-populated would mean the two guards
   disagree about whether an order already exists. */
const halfPopulated = await orders.countDocuments({
    $or: [
        { "paymentResult.squareOrderId": { $exists: true, $nin: [null, ""] }, "paymentResult.squarePaymentId": { $in: [null, ""] } },
        { "paymentResult.squarePaymentId": { $exists: true, $nin: [null, ""] }, "paymentResult.squareOrderId": { $in: [null, ""] } },
    ],
});
console.log(`\n  Orders with only one of the two Square ids populated: ${halfPopulated}`);
if (halfPopulated > 0) {
    problems += halfPopulated;
    console.log("    (the two duplicate-checks key on different fields, so these are");
    console.log("     invisible to one guard and visible to the other)");
}

/* ══════════════════════════════════════════════════════════════ */

console.log("\n" + "=".repeat(78));
console.log(problems === 0
    ? "\nRESULT: clean — no unverified orders and no duplicates.\n"
    : `\nRESULT: ${problems} item(s) need attention. See above.\n`);

await mongoose.disconnect();
process.exit(problems === 0 ? 0 : 1);
