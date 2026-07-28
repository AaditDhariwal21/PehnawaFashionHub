/**
 * Concurrency verification for order creation.
 *
 * Run with:
 *   node src/scripts/verifyOrderConcurrency.js
 *
 * Asserts that a single payment produces exactly one order and exactly one
 * stock deduction, no matter how many triggers fire for it at once. In
 * production those triggers are POST /api/payments/confirm plus the Square
 * payment.created and payment.updated webhooks, which arrive at roughly the
 * same moment.
 *
 * WHAT IS REAL AND WHAT IS SIMULATED
 *
 * Real: the processing lease (claimPendingOrder), the unique partial index on
 * Order.paymentResult.squareOrderId, the stock decrement/restore against real
 * Product documents, and Order.create through the real model.
 *
 * Simulated: only squareClient.orders.get(), replaced by an await of a few
 * milliseconds. That call is not what is under test — it is the *duration*
 * between the duplicate check and the insert that opens the race, and a delay
 * reproduces that faithfully without reaching Square. Each worker also counts
 * its own simulated call, which is how "no duplicated work" is asserted rather
 * than assumed.
 *
 * There is no test framework in this repo, so this follows the existing
 * src/scripts/ convention. Every fixture is tagged and removed in the finally
 * block. Point MONGO_URI at a development database.
 */

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Order from "../models/Order.js";
import PendingOrder from "../models/PendingOrder.js";
import Product from "../models/Products.js";
import User from "../models/Users.js";
import PromoCode from "../models/PromoCode.js";
import PromoRedemption from "../models/PromoRedemption.js";
import {
    claimPendingOrder,
    findOrderBySquareOrderId,
    isDuplicateKeyError,
    isDuplicateSquareOrderError,
    restoreStock,
} from "../services/orderCreation.js";
import { confirmPromoRedemption } from "../services/promoService.js";

const TAG = "__VERIFY_CONCURRENCY__";
const START_STOCK = 10;
const QTY = 1;

let passed = 0;
let failed = 0;

const check = (label, condition, detail = "") => {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${label}`);
    } else {
        failed += 1;
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const shippingAddress = {
    fullName: "Concurrency Test", phone: "5550000000", addressLine1: "1 Test St",
    city: "Testville", state: "NY", zipCode: "10001", country: "United States",
};

const run = async () => {
    await connectDB();

    /* The indexes are what this whole script is validating, so make sure they
       exist before any worker runs rather than relying on lazy autoIndex. */
    await Order.init();
    await PendingOrder.init();
    await PromoRedemption.init();

    let user;
    let product;

    try {
        user = await User.create({
            name: `${TAG} user`,
            email: `verify-conc-${Date.now()}@example.invalid`,
            password: "x",
        });

        product = await Product.create({
            name: `${TAG} Kurta`,
            description: TAG,
            price: 100,
            gender: "Men",
            category: "Men's Kurta",
            weight: 1,
            variants: [{ color: "Blue", size: "M", price: 100, stock: START_STOCK }],
        });

        const stockOf = async () => {
            const p = await Product.findById(product._id).select("variants");
            return p.variants.find((v) => v.color === "Blue" && v.size === "M").stock;
        };

        const resetStock = () =>
            Product.updateOne(
                { _id: product._id, variants: { $elemMatch: { color: "Blue", size: "M" } } },
                { $set: { "variants.$.stock": START_STOCK } }
            );

        const makePending = async (squareOrderId, promo = null) =>
            PendingOrder.create({
                userId: user._id,
                paymentLinkId: `${TAG}-link-${squareOrderId}`,
                squareOrderId,
                cartItems: [{ productId: product._id, color: "Blue", size: "M", quantity: QTY }],
                shippingAddress,
                subtotal: 100,
                discountAmount: promo ? promo.discountAmount : 0,
                promo: promo ? promo.details : undefined,
                shippingCost: 8,
                totalAmount: promo ? 108 - promo.discountAmount : 108,
            });

        /**
         * Faithful stand-in for the body of both real handlers, in the same
         * order: duplicate check -> [lease] -> Square call -> stock deduction ->
         * Order.create -> confirm promo -> delete pending.
         */
        const worker = async ({ pending, label, useLease = true, squareCallMs = 40, counters }) => {
            const squareOrderId = pending.squareOrderId;

            /* Step: pre-existing order check (what both handlers do first). */
            if (await findOrderBySquareOrderId(squareOrderId)) {
                counters.shortCircuited.push(label);
                return { label, outcome: "already-existed" };
            }

            /* Step: processing lease. */
            if (useLease) {
                const claimed = await claimPendingOrder(pending._id);
                if (!claimed) {
                    counters.lostLease.push(label);
                    return { label, outcome: "lost-lease" };
                }
            }
            counters.pastLease.push(label);

            /* Step: the Square round-trip. Simulated — see the header note. */
            counters.squareCalls.push(label);
            await sleep(squareCallMs);

            /* Step: deduct stock (the real thing, atomically per variant). */
            const dec = await Product.updateOne(
                {
                    _id: product._id,
                    variants: { $elemMatch: { color: "Blue", size: "M", stock: { $gte: QTY } } },
                },
                { $inc: { "variants.$.stock": -QTY } }
            );
            if (dec.modifiedCount === 0) {
                counters.stockFailed.push(label);
                return { label, outcome: "stock-failed" };
            }
            const resolved = [{ product, color: "Blue", size: "M", qty: QTY }];

            /* Step: create the order. */
            try {
                const order = await Order.create({
                    /* Explicit distinct orderId so this test isolates the
                       squareOrderId index. See the note this script prints about
                       PHN-${Date.now()} not being collision-safe. */
                    orderId: `${TAG}-${label}-${Math.floor(Math.random() * 1e9)}`,
                    user: user._id,
                    items: [{
                        productId: product._id, name: product.name,
                        color: "Blue", size: "M", price: 100, quantity: QTY,
                    }],
                    shippingAddress,
                    paymentMethod: "Square",
                    paymentResult: {
                        squareOrderId,
                        squarePaymentId: `${TAG}-pay-${squareOrderId}`,
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

                counters.created.push(label);
                await confirmPromoRedemption({ squareOrderId, orderId: order._id });
                await PendingOrder.deleteOne({ _id: pending._id });
                return { label, outcome: "created", orderId: order._id };
            } catch (err) {
                /* Exactly what both handlers now do. */
                await restoreStock(resolved);
                if (isDuplicateSquareOrderError(err)) {
                    counters.rejectedByIndex.push(label);
                    return { label, outcome: "rejected-by-index" };
                }
                throw err;
            }
        };

        const freshCounters = () => ({
            shortCircuited: [], lostLease: [], pastLease: [], squareCalls: [],
            stockFailed: [], created: [], rejectedByIndex: [],
        });

        /* ═══════════════════════════════════════════════════════════
           TEST A — three triggers, full fix. The production scenario:
           confirmPayment + payment.created + payment.updated.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST A  three simultaneous triggers, lease + index active");
        {
            await resetStock();
            const sqId = `${TAG}-A-${Date.now()}`;
            const pending = await makePending(sqId);
            const c = freshCounters();

            await Promise.all([
                worker({ pending, label: "confirmPayment", counters: c }),
                worker({ pending, label: "webhook:payment.created", counters: c }),
                worker({ pending, label: "webhook:payment.updated", counters: c }),
            ]);

            const orderCount = await Order.countDocuments({ "paymentResult.squareOrderId": sqId });
            const stock = await stockOf();

            check("exactly one order created", orderCount === 1, `got ${orderCount}`);
            check(`stock decremented exactly once (${START_STOCK} -> ${START_STOCK - QTY})`,
                stock === START_STOCK - QTY, `got ${stock}`);
            check("only one trigger got past the lease",
                c.pastLease.length === 1, `got ${c.pastLease.length}: ${c.pastLease}`);
            check("the other two lost the lease and stopped",
                c.lostLease.length + c.shortCircuited.length === 2,
                `lostLease=${c.lostLease.length} shortCircuited=${c.shortCircuited.length}`);
            check("the Square API would have been called only once (no duplicated work)",
                c.squareCalls.length === 1, `got ${c.squareCalls.length}`);
            check("the unique index never had to fire — the lease did the work",
                c.rejectedByIndex.length === 0, `got ${c.rejectedByIndex.length}`);

            await PendingOrder.deleteMany({ squareOrderId: sqId });
        }

        /* ═══════════════════════════════════════════════════════════
           TEST B — lease bypassed, to prove the index backstop alone
           still holds. This is the pre-fix interleaving.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST B  lease bypassed — index backstop must still hold the line");
        {
            await resetStock();
            const sqId = `${TAG}-B-${Date.now()}`;
            const pending = await makePending(sqId);
            const c = freshCounters();

            await Promise.all([
                worker({ pending, label: "w1", useLease: false, counters: c }),
                worker({ pending, label: "w2", useLease: false, counters: c }),
                worker({ pending, label: "w3", useLease: false, counters: c }),
            ]);

            const orderCount = await Order.countDocuments({ "paymentResult.squareOrderId": sqId });
            const stock = await stockOf();

            check("all three did the work (confirming the lease was genuinely bypassed)",
                c.pastLease.length === 3, `got ${c.pastLease.length}`);
            check("still exactly one order — the database refused the duplicates",
                orderCount === 1, `got ${orderCount}`);
            check("losers were rejected by the unique index",
                c.rejectedByIndex.length === 2, `got ${c.rejectedByIndex.length}`);
            check(`stock still net -1 — losers restored what they deducted`,
                stock === START_STOCK - QTY, `got ${stock} (expected ${START_STOCK - QTY})`);

            await PendingOrder.deleteMany({ squareOrderId: sqId });
        }

        /* ═══════════════════════════════════════════════════════════
           TEST C — crash recovery. A trigger claimed the lease and died;
           the checkout is paid but has no order. A later trigger must be
           able to take over, and takeover must not stampede.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST C  expired lease is recoverable, and only one trigger recovers it");
        {
            await resetStock();
            const sqId = `${TAG}-C-${Date.now()}`;
            const pending = await makePending(sqId);
            const c = freshCounters();

            /* Stands in for a worker that claimed and then died mid-flight. */
            await PendingOrder.updateOne(
                { _id: pending._id },
                { $set: { processingStartedAt: new Date(Date.now() - 60 * 1000) } }
            );

            const results = await Promise.all([
                worker({ pending, label: "retry-1", counters: c }),
                worker({ pending, label: "retry-2", counters: c }),
            ]);

            const orderCount = await Order.countDocuments({ "paymentResult.squareOrderId": sqId });
            const stock = await stockOf();

            check("the expired lease was recoverable — a paid checkout isn't stranded",
                c.pastLease.length >= 1, `got ${c.pastLease.length}`);
            check("takeover doesn't stampede: exactly one trigger recovered it",
                c.pastLease.length === 1, `got ${c.pastLease.length}: ${c.pastLease}`);
            check("exactly one order", orderCount === 1, `got ${orderCount}`);
            check("stock net -1", stock === START_STOCK - QTY, `got ${stock}`);
            check("neither call threw",
                results.every((r) => r && r.outcome), JSON.stringify(results.map((r) => r?.outcome)));

            await PendingOrder.deleteMany({ squareOrderId: sqId });
        }

        /* ═══════════════════════════════════════════════════════════
           TEST C2 — the one gap the lease genuinely cannot close: a
           trigger that is already past its claim and still working when
           its lease expires, overtaken by a new one. Both reach the
           insert, so only the index can separate them. This is the
           scenario the backstop exists for.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST C2  slow in-flight trigger overtaken after its lease expired");
        {
            await resetStock();
            const sqId = `${TAG}-C2-${Date.now()}`;
            const pending = await makePending(sqId);
            const c = freshCounters();

            /* Expired lease already on the document; the in-flight worker is
               modelled by useLease:false, i.e. it is past its own claim and
               still doing the slow part. */
            await PendingOrder.updateOne(
                { _id: pending._id },
                { $set: { processingStartedAt: new Date(Date.now() - 60 * 1000) } }
            );

            const results = await Promise.all([
                worker({ pending, label: "slow-in-flight", useLease: false, squareCallMs: 150, counters: c }),
                worker({ pending, label: "overtaker", useLease: true, squareCallMs: 10, counters: c }),
            ]);

            const orderCount = await Order.countDocuments({ "paymentResult.squareOrderId": sqId });
            const stock = await stockOf();

            check("both reached the insert (the lease could not separate them)",
                c.pastLease.length === 2, `got ${c.pastLease.length}`);
            check("the index refused the second one: exactly one order",
                orderCount === 1, `got ${orderCount}`);
            check("one created, one rejected by the index, no crash",
                c.created.length === 1 && c.rejectedByIndex.length === 1,
                `created=${c.created.length} rejected=${c.rejectedByIndex.length}`);
            check("stock net -1, not -2 — the loser restored its deduction",
                stock === START_STOCK - QTY, `got ${stock}`);
            check("neither call threw",
                results.every((r) => r && r.outcome), JSON.stringify(results.map((r) => r?.outcome)));

            await PendingOrder.deleteMany({ squareOrderId: sqId });
        }

        /* ═══════════════════════════════════════════════════════════
           TEST D — the promo redemption must attach to the order that
           actually survives, never to a rejected duplicate.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST D  promo redemption follows the surviving order");
        {
            await resetStock();
            const sqId = `${TAG}-D-${Date.now()}`;

            const promoCode = await PromoCode.create({
                code: `CONC${Date.now().toString(36).toUpperCase()}`,
                description: TAG,
                discountType: "FLAT",
                discountValue: 10,
                validFrom: new Date(Date.now() - 86400000),
                validTill: new Date(Date.now() + 86400000),
                totalUsageLimit: 1,
                usedCount: 1, // already reserved at create-checkout time
            });

            const redemption = await PromoRedemption.create({
                promoCode: promoCode._id,
                code: promoCode.code,
                user: user._id,
                squareOrderId: sqId,
                discountAmount: 10,
                status: "RESERVED",
                slot: 0,
            });

            const pending = await makePending(sqId, {
                discountAmount: 10,
                details: { promoCodeId: promoCode._id, code: promoCode.code, discountType: "FLAT" },
            });
            const c = freshCounters();

            /* Bypass the lease so several workers race all the way to the insert
               — the harshest case for redemption linkage. */
            await Promise.all([
                worker({ pending, label: "d1", useLease: false, counters: c }),
                worker({ pending, label: "d2", useLease: false, counters: c }),
                worker({ pending, label: "d3", useLease: false, counters: c }),
            ]);

            const orders = await Order.find({ "paymentResult.squareOrderId": sqId }).select("_id discountAmount");
            const finalRedemption = await PromoRedemption.findById(redemption._id);
            const finalPromo = await PromoCode.findById(promoCode._id);

            check("exactly one order", orders.length === 1, `got ${orders.length}`);
            check("redemption is CONFIRMED",
                finalRedemption.status === "CONFIRMED", `got ${finalRedemption.status}`);
            check("redemption points at the order that actually exists",
                orders.length === 1 && String(finalRedemption.order) === String(orders[0]._id),
                `redemption.order=${finalRedemption.order} survivingOrder=${orders[0]?._id}`);
            check("the discount is recorded on the surviving order",
                orders[0]?.discountAmount === 10, `got ${orders[0]?.discountAmount}`);
            check("usedCount was not inflated by the losing attempts",
                finalPromo.usedCount === 1, `got ${finalPromo.usedCount}`);
            check("exactly one redemption record exists for this payment",
                (await PromoRedemption.countDocuments({ squareOrderId: sqId })) === 1);

            await PendingOrder.deleteMany({ squareOrderId: sqId });
        }

        /* ═══════════════════════════════════════════════════════════
           TEST E — orderId generation and duplicate-key discrimination.
           The tests above set explicit orderIds so they isolate the
           squareOrderId index; this one exercises the real generator.
           ═══════════════════════════════════════════════════════════ */
        console.log("\nTEST E  orderId generation is collision-safe and correctly discriminated");
        {
            /* E1 — many orders created as fast as possible, so a great number of
               them land in the same millisecond. No paymentResult, so the
               squareOrderId index (partial on $type string) excludes them and
               only the orderId index is in play. */
            const BURST = 250;
            const results = await Promise.allSettled(
                Array.from({ length: BURST }, () =>
                    Order.create({
                        user: user._id,
                        items: [{
                            productId: product._id, name: `${TAG} burst`,
                            price: 1, quantity: 1,
                        }],
                        shippingAddress,
                        subtotal: 1, shippingCost: 0, totalAmount: 1,
                    })
                )
            );

            const created = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
            const rejected = results.filter((r) => r.status === "rejected");
            const distinctIds = new Set(created.map((o) => o.orderId));
            const sameMs = new Set(created.map((o) => o.orderId.split("-")[1])).size;

            check(`all ${BURST} concurrent orders were created (no orderId collisions)`,
                created.length === BURST,
                `created ${created.length}, rejected ${rejected.length}: ${rejected[0]?.reason?.message ?? ""}`);
            check("every generated orderId is distinct",
                distinctIds.size === created.length, `${distinctIds.size} distinct of ${created.length}`);
            check(`the burst really did share milliseconds (${sameMs} distinct timestamps for ${BURST} orders)`,
                sameMs < BURST, `${sameMs} distinct timestamps — burst was too slow to prove the point`);
            check("orderId keeps the PHN- prefix and gains a random suffix",
                created.every((o) => /^PHN-\d+-[0-9A-F]{6}$/.test(o.orderId)),
                `sample: ${created[0]?.orderId}`);

            await Order.deleteMany({ _id: { $in: created.map((o) => o._id) } });

            /* E2 — an orderId collision must NOT be reported as a duplicate
               payment. Before the discriminating check, this misclassification
               would have made a handler look for a winning order, find none, and
               tell the customer their payment was still processing while their
               paid order was never created. */
            const fixedOrderId = `${TAG}-COLLIDE-${Date.now()}`;
            const baseDoc = (squareOrderId) => ({
                orderId: fixedOrderId,
                user: user._id,
                items: [{ productId: product._id, name: `${TAG} c`, price: 1, quantity: 1 }],
                shippingAddress,
                paymentResult: { squareOrderId, squarePaymentId: `${squareOrderId}-p`, status: "COMPLETED" },
                subtotal: 1, shippingCost: 0, totalAmount: 1,
            });

            await Order.create(baseDoc(`${TAG}-sq-E2-first`));

            let collisionError = null;
            try {
                /* Same orderId, DIFFERENT squareOrderId — so only the orderId
                   index can reject this. */
                await Order.create(baseDoc(`${TAG}-sq-E2-second`));
            } catch (err) {
                collisionError = err;
            }

            check("a duplicate orderId is rejected by the database",
                isDuplicateKeyError(collisionError), `got ${collisionError?.code}`);
            check("it is NOT misreported as a duplicate payment",
                collisionError && isDuplicateSquareOrderError(collisionError) === false,
                `keyPattern=${JSON.stringify(collisionError?.keyPattern)}`);
            check("the rejecting index is identified as orderId",
                Object.keys(collisionError?.keyPattern ?? {}).includes("orderId"),
                `keyPattern=${JSON.stringify(collisionError?.keyPattern)}`);

            /* And the positive case still classifies correctly. */
            let squareDupError = null;
            try {
                await Order.create({ ...baseDoc(`${TAG}-sq-E2-first`), orderId: `${TAG}-DIFFERENT-${Date.now()}` });
            } catch (err) {
                squareDupError = err;
            }
            check("a duplicate squareOrderId IS reported as a duplicate payment",
                isDuplicateSquareOrderError(squareDupError),
                `keyPattern=${JSON.stringify(squareDupError?.keyPattern)}`);
        }

        console.log(`\n${"─".repeat(62)}`);
        console.log(`${passed} passed, ${failed} failed`);
        console.log("─".repeat(62));
    } finally {
        const promoIds = (await PromoCode.find({ description: TAG }).select("_id")).map((p) => p._id);
        await PromoRedemption.deleteMany({ promoCode: { $in: promoIds } });
        await PromoCode.deleteMany({ _id: { $in: promoIds } });
        await Order.deleteMany({ orderId: new RegExp(`^${TAG}`) });
        await PendingOrder.deleteMany({ paymentLinkId: new RegExp(`^${TAG}`) });
        await Product.deleteMany({ description: TAG });
        await User.deleteMany({ name: new RegExp(`^${TAG}`) });
        await mongoose.disconnect();
    }

    process.exit(failed === 0 ? 0 : 1);
};

run().catch((err) => {
    console.error("\nConcurrency verification crashed:", err);
    process.exit(1);
});
