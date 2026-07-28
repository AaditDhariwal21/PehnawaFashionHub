/**
 * Verification harness for the promo code feature.
 *
 * Run with:
 *   node src/scripts/verifyPromoCodes.js
 *
 * There is no test framework in this repo (no `test` script, no jest/vitest),
 * so rather than introduce one as a side effect of this feature, this follows
 * the existing convention of runnable scripts under src/scripts/ and asserts
 * against a real database.
 *
 * It exercises promoService directly — the same functions the /api/promo
 * endpoints and createCheckoutSession() call — covering:
 *
 *   · percentage and flat happy paths
 *   · a percentage cap
 *   · every distinct validation failure reason
 *   · category scoping discounting only eligible line items
 *   · the concurrency race on a code with exactly one use remaining
 *   · release returning a slot to the pool
 *
 * SAFETY: every fixture it creates is prefixed __VERIFY_ / has a sentinel
 * marker, and is deleted in the finally block. It creates a throwaway user and
 * two throwaway products; it never touches existing data. Point MONGO_URI at a
 * development database anyway.
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import PromoCode from "../models/PromoCode.js";
import PromoRedemption from "../models/PromoRedemption.js";
import Product from "../models/Products.js";
import Order from "../models/Order.js";
import User from "../models/Users.js";
import {
    validatePromoForCart,
    reservePromoCode,
    confirmPromoRedemption,
    releasePromoReservation,
    toPromoLineItem,
    PROMO_ERRORS,
} from "../services/promoService.js";

const TAG = "__VERIFY_PROMO__";

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

const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

/* ── Fixture builders ───────────────────────────────────────── */

let codeSeq = 0;

/**
 * Creates a promo with sensible defaults. `code` and `description` are forced
 * after the spread: the code must be unique per run, and teardown identifies
 * fixtures by the TAG in `description`.
 */
const makePromo = (overrides = {}) => {
    codeSeq += 1;
    return PromoCode.create({
        discountType: "PERCENTAGE",
        discountValue: 10,
        validFrom: daysFromNow(-1),
        validTill: daysFromNow(1),
        ...overrides,
        code: `VERIFY${Date.now().toString(36).toUpperCase()}X${codeSeq}`,
        description: TAG,
    });
};

const run = async () => {
    await connectDB();

    let user;
    let menProduct;
    let kidsProduct;

    try {
        /* ── Fixtures ── */
        user = await User.create({
            name: `${TAG} user`,
            email: `verify-promo-${Date.now()}@example.invalid`,
            password: "x",
        });

        menProduct = await Product.create({
            name: `${TAG} Mens Kurta`,
            description: TAG,
            price: 100,
            gender: "Men",
            category: "Men's Kurta",
            weight: 1,
            variants: [{ color: "Blue", size: "M", price: 100, stock: 50 }],
        });

        kidsProduct = await Product.create({
            name: `${TAG} Kids Tee`,
            description: TAG,
            price: 40,
            gender: "Kids",
            category: "Boys",
            weight: 1,
            variants: [{ color: "Red", size: "S", price: 40, stock: 50 }],
        });

        /* One Men line at $100 and one Kids line at $40 → $140 subtotal. */
        const mixedCart = [
            toPromoLineItem(menProduct, 100, 1),
            toPromoLineItem(kidsProduct, 40, 1),
        ];

        const validate = (promo, lineItems = mixedCart, userId = user._id) =>
            validatePromoForCart({ code: promo.code, userId, lineItems });

        /* ══════════ Happy paths ══════════ */
        console.log("\nHappy paths");

        const pct = await makePromo({ discountType: "PERCENTAGE", discountValue: 25 });
        const pctResult = await validate(pct);
        check(
            "percentage code discounts 25% of the whole cart ($140 → $35 off)",
            pctResult.ok && pctResult.discountAmount === 35,
            `got ${JSON.stringify({ ok: pctResult.ok, discount: pctResult.discountAmount, code: pctResult.code })}`
        );
        check(
            "percentage code reports the post-discount subtotal",
            pctResult.ok && pctResult.subtotalAfterDiscount === 105,
            `got ${pctResult.subtotalAfterDiscount}`
        );

        const flat = await makePromo({ discountType: "FLAT", discountValue: 20 });
        const flatResult = await validate(flat);
        check(
            "flat code discounts a fixed $20",
            flatResult.ok && flatResult.discountAmount === 20,
            `got ${flatResult.discountAmount}`
        );

        const capped = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 50,
            maxDiscountAmount: 30,
        });
        const cappedResult = await validate(capped);
        check(
            "percentage cap clamps 50% of $140 down to the $30 cap",
            cappedResult.ok && cappedResult.discountAmount === 30,
            `got ${cappedResult.discountAmount}`
        );

        const overflow = await makePromo({ discountType: "FLAT", discountValue: 500 });
        const overflowResult = await validate(overflow, [toPromoLineItem(kidsProduct, 40, 1)]);
        check(
            "flat discount larger than the cart is capped at the cart value, never negative",
            overflowResult.ok && overflowResult.discountAmount === 40,
            `got ${overflowResult.discountAmount}`
        );

        /* ══════════ Scoping ══════════ */
        console.log("\nCategory / product scoping");

        const kidsOnly = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 50,
            categories: ["Boys"],
        });
        const kidsResult = await validate(kidsOnly);
        check(
            "category-scoped code discounts only the eligible line (50% of $40 = $20, not of $140)",
            kidsResult.ok && kidsResult.discountAmount === 20,
            `got ${kidsResult.discountAmount}`
        );
        check(
            "category-scoped code reports the eligible subtotal separately from the cart subtotal",
            kidsResult.ok && kidsResult.eligibleSubtotal === 40 && kidsResult.cartSubtotal === 140,
            `got eligible=${kidsResult.eligibleSubtotal} cart=${kidsResult.cartSubtotal}`
        );
        check(
            "category-scoped code flags that it doesn't cover the whole cart",
            kidsResult.ok && kidsResult.appliesToWholeCart === false
        );

        /* Gender scoping — the whole-demographic coupon shape the flat design
           could not express, because gender was fused into the category string. */
        const menOnly = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 10,
            genders: ["Men"],
        });
        const menResult = await validate(menOnly);
        check(
            "gender-scoped code discounts only that gender's line (10% of $100 = $10)",
            menResult.ok && menResult.discountAmount === 10,
            `got ${menResult.discountAmount}`
        );
        check(
            "gender-scoped code reports the eligible subtotal as that gender's items only",
            menResult.ok && menResult.eligibleSubtotal === 100 && menResult.cartSubtotal === 140,
            `got eligible=${menResult.eligibleSubtotal} cart=${menResult.cartSubtotal}`
        );

        const womenOnly = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 50,
            genders: ["Women"],
        });
        const womenResult = await validate(womenOnly);
        check(
            "a gender with nothing in the cart yields NO_ELIGIBLE_ITEMS",
            !womenResult.ok && womenResult.code === PROMO_ERRORS.NO_ELIGIBLE_ITEMS,
            `got ${womenResult.code}`
        );

        /* Scopes widen rather than intersect: matching either qualifies. */
        const genderOrCategory = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 10,
            genders: ["Men"],
            categories: ["Boys"],
        });
        const bothResult = await validate(genderOrCategory);
        check(
            "gender and category scopes widen (both lines eligible → 10% of $140 = $14)",
            bothResult.ok && bothResult.discountAmount === 14,
            `got ${bothResult.discountAmount}`
        );
        check(
            "widened scope covers the whole cart",
            bothResult.ok && bothResult.appliesToWholeCart === true
        );

        const excluded = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 50,
            excludedProductIds: [menProduct._id, kidsProduct._id],
        });
        const excludedResult = await validate(excluded);
        check(
            "excluding every product yields NO_ELIGIBLE_ITEMS",
            !excludedResult.ok && excludedResult.code === PROMO_ERRORS.NO_ELIGIBLE_ITEMS,
            `got ${excludedResult.code}`
        );

        const absentCategory = await makePromo({
            discountType: "PERCENTAGE",
            discountValue: 10,
            categories: ["Sarees"],
        });
        const absentResult = await validate(absentCategory);
        check(
            "a code scoped to an absent category yields NO_ELIGIBLE_ITEMS",
            !absentResult.ok && absentResult.code === PROMO_ERRORS.NO_ELIGIBLE_ITEMS,
            `got ${absentResult.code}`
        );

        /* ══════════ Distinct failure reasons ══════════ */
        console.log("\nDistinct failure reasons");

        const missing = await validatePromoForCart({
            code: "NOPE-DOES-NOT-EXIST-XYZ",
            userId: user._id,
            lineItems: mixedCart,
        });
        check(
            "unknown code → NOT_FOUND",
            !missing.ok && missing.code === PROMO_ERRORS.NOT_FOUND,
            `got ${missing.code}`
        );

        const blank = await validatePromoForCart({ code: "  ", userId: user._id, lineItems: mixedCart });
        check(
            "blank code → CODE_REQUIRED",
            !blank.ok && blank.code === PROMO_ERRORS.CODE_REQUIRED,
            `got ${blank.code}`
        );

        const emptyCart = await validate(pct, []);
        check(
            "empty cart → CART_EMPTY",
            !emptyCart.ok && emptyCart.code === PROMO_ERRORS.CART_EMPTY,
            `got ${emptyCart.code}`
        );

        const killed = await makePromo({ isActive: false });
        const killedResult = await validate(killed);
        check(
            "kill-switch off → INACTIVE (distinct from EXPIRED, despite a valid date window)",
            !killedResult.ok && killedResult.code === PROMO_ERRORS.INACTIVE,
            `got ${killedResult.code}`
        );

        const future = await makePromo({ validFrom: daysFromNow(3), validTill: daysFromNow(9) });
        const futureResult = await validate(future);
        check(
            "not-yet-started → NOT_STARTED",
            !futureResult.ok && futureResult.code === PROMO_ERRORS.NOT_STARTED,
            `got ${futureResult.code}`
        );

        const past = await makePromo({ validFrom: daysFromNow(-9), validTill: daysFromNow(-3) });
        const pastResult = await validate(past);
        check(
            "expired → EXPIRED (a different reason from NOT_STARTED)",
            !pastResult.ok && pastResult.code === PROMO_ERRORS.EXPIRED,
            `got ${pastResult.code}`
        );

        const bigSpend = await makePromo({ minOrderValue: 500 });
        const bigSpendResult = await validate(bigSpend);
        check(
            "cart below minimum → MIN_ORDER_NOT_MET",
            !bigSpendResult.ok && bigSpendResult.code === PROMO_ERRORS.MIN_ORDER_NOT_MET,
            `got ${bigSpendResult.code}`
        );
        check(
            "MIN_ORDER_NOT_MET carries the threshold and subtotal so the UI can show the shortfall",
            bigSpendResult.minOrderValue === 500 && bigSpendResult.cartSubtotal === 140,
            `got min=${bigSpendResult.minOrderValue} subtotal=${bigSpendResult.cartSubtotal}`
        );

        /* Total limit already exhausted. */
        const exhausted = await makePromo({ totalUsageLimit: 1 });
        await PromoCode.updateOne({ _id: exhausted._id }, { $set: { usedCount: 1 } });
        const exhaustedResult = await validate(exhausted);
        check(
            "total limit reached → LIMIT_REACHED",
            !exhaustedResult.ok && exhaustedResult.code === PROMO_ERRORS.LIMIT_REACHED,
            `got ${exhaustedResult.code}`
        );

        /* Per-user limit already used by this user. */
        const oncePerUser = await makePromo({ perUserUsageLimit: 1 });
        await PromoRedemption.create({
            promoCode: oncePerUser._id,
            code: oncePerUser.code,
            user: user._id,
            squareOrderId: `${TAG}-prior`,
            discountAmount: 5,
            status: "CONFIRMED",
            slot: 0,
        });
        const perUserResult = await validate(oncePerUser);
        check(
            "per-user limit reached → USER_LIMIT_REACHED (distinct from the global LIMIT_REACHED)",
            !perUserResult.ok && perUserResult.code === PROMO_ERRORS.USER_LIMIT_REACHED,
            `got ${perUserResult.code}`
        );

        /* First-order-only, violated by an existing order. */
        const firstOnly = await makePromo({ firstOrderOnly: true });
        const firstOrderOkResult = await validate(firstOnly);
        check(
            "first-order-only passes for a customer with no orders",
            firstOrderOkResult.ok,
            `got ${firstOrderOkResult.code}`
        );

        const priorOrder = await Order.create({
            orderId: `${TAG}-${Date.now()}`,
            user: user._id,
            items: [{ productId: menProduct._id, name: `${TAG} item`, price: 100, quantity: 1 }],
            shippingAddress: {
                fullName: "Verify", phone: "0000000000", addressLine1: "1 Test St",
                city: "Testville", state: "NY", zipCode: "10001",
            },
            subtotal: 100, shippingCost: 8, totalAmount: 108,
        });
        const firstOnlyResult = await validate(firstOnly);
        check(
            "first-order-only violated by an existing order → FIRST_ORDER_ONLY",
            !firstOnlyResult.ok && firstOnlyResult.code === PROMO_ERRORS.FIRST_ORDER_ONLY,
            `got ${firstOnlyResult.code}`
        );
        await Order.deleteOne({ _id: priorOrder._id });

        /* ══════════ Concurrency ══════════ */
        console.log("\nConcurrency — one use remaining, two simultaneous checkouts");

        const lastOne = await makePromo({
            discountType: "FLAT",
            discountValue: 10,
            totalUsageLimit: 1,
            perUserUsageLimit: 5, // isolate the GLOBAL limit from the per-user one
        });

        const userA = await User.create({
            name: `${TAG} A`, email: `verify-a-${Date.now()}@example.invalid`, password: "x",
        });
        const userB = await User.create({
            name: `${TAG} B`, email: `verify-b-${Date.now()}@example.invalid`, password: "x",
        });

        /* Fire both reservations without awaiting in between — this is the
           read-then-write window a naive implementation loses. */
        const [resA, resB] = await Promise.all([
            reservePromoCode({
                promo: lastOne, userId: userA._id, discountAmount: 10,
                squareOrderId: `${TAG}-A`,
            }),
            reservePromoCode({
                promo: lastOne, userId: userB._id, discountAmount: 10,
                squareOrderId: `${TAG}-B`,
            }),
        ]);

        const winners = [resA, resB].filter((r) => r.ok);
        const losers = [resA, resB].filter((r) => !r.ok);

        check(
            "exactly one of two concurrent reservations succeeds",
            winners.length === 1,
            `${winners.length} succeeded`
        );
        check(
            "the loser gets a clean LIMIT_REACHED rather than an exception",
            losers.length === 1 && losers[0].code === PROMO_ERRORS.LIMIT_REACHED,
            `got ${losers[0]?.code}`
        );

        const afterRace = await PromoCode.findById(lastOne._id);
        check(
            "usedCount lands on exactly 1 — the limit was not over-consumed",
            afterRace.usedCount === 1,
            `got ${afterRace.usedCount}`
        );

        const reservedDocs = await PromoRedemption.countDocuments({
            promoCode: lastOne._id,
            status: "RESERVED",
        });
        check(
            "only one PromoRedemption record was created",
            reservedDocs === 1,
            `got ${reservedDocs}`
        );

        /* Per-user race: same user, two concurrent checkouts, 1-per-user code. */
        const perUserRace = await makePromo({
            discountType: "FLAT", discountValue: 5,
            totalUsageLimit: 10, perUserUsageLimit: 1,
        });
        const [selfA, selfB] = await Promise.all([
            reservePromoCode({
                promo: perUserRace, userId: userA._id, discountAmount: 5,
                squareOrderId: `${TAG}-self-A`,
            }),
            reservePromoCode({
                promo: perUserRace, userId: userA._id, discountAmount: 5,
                squareOrderId: `${TAG}-self-B`,
            }),
        ]);
        check(
            "the same customer racing a 1-per-user code succeeds exactly once",
            [selfA, selfB].filter((r) => r.ok).length === 1,
            `${[selfA, selfB].filter((r) => r.ok).length} succeeded`
        );
        check(
            "the losing self-race gets USER_LIMIT_REACHED",
            [selfA, selfB].filter((r) => !r.ok)[0]?.code === PROMO_ERRORS.USER_LIMIT_REACHED,
            `got ${[selfA, selfB].filter((r) => !r.ok)[0]?.code}`
        );
        const perUserAfter = await PromoCode.findById(perUserRace._id);
        check(
            "the rolled-back self-race did not leak a global usage slot",
            perUserAfter.usedCount === 1,
            `got ${perUserAfter.usedCount}`
        );

        /* ══════════ Confirm / release lifecycle ══════════ */
        console.log("\nReservation lifecycle");

        const winningSquareOrderId = winners[0].redemption.squareOrderId;
        const fakeOrderId = new mongoose.Types.ObjectId();
        const confirmed = await confirmPromoRedemption({
            squareOrderId: winningSquareOrderId,
            orderId: fakeOrderId,
        });
        check(
            "RESERVED → CONFIRMED on order creation",
            confirmed?.status === "CONFIRMED" && String(confirmed.order) === String(fakeOrderId),
            `got ${confirmed?.status}`
        );

        /* The webhook and confirmPayment both fire for the same order. */
        const confirmedAgain = await confirmPromoRedemption({
            squareOrderId: winningSquareOrderId,
            orderId: fakeOrderId,
        });
        check(
            "confirming twice is idempotent (webhook races confirmPayment)",
            confirmedAgain?.status === "CONFIRMED" &&
                String(confirmedAgain._id) === String(confirmed._id),
            `got ${confirmedAgain?.status}`
        );
        const stillOne = await PromoCode.findById(lastOne._id);
        check(
            "the second confirm did not double-count usedCount",
            stillOne.usedCount === 1,
            `got ${stillOne.usedCount}`
        );

        /* Release should return the slot so the code is redeemable again. */
        const releasable = await makePromo({
            discountType: "FLAT", discountValue: 5, totalUsageLimit: 1,
        });
        const held = await reservePromoCode({
            promo: releasable, userId: userB._id, discountAmount: 5,
            squareOrderId: `${TAG}-release`,
        });
        check("a limited code reserves once", held.ok);

        const blockedWhileHeld = await validatePromoForCart({
            code: releasable.code, userId: userA._id, lineItems: mixedCart,
        });
        check(
            "while the slot is held the code reads as fully claimed",
            !blockedWhileHeld.ok && blockedWhileHeld.code === PROMO_ERRORS.LIMIT_REACHED,
            `got ${blockedWhileHeld.code}`
        );

        const released = await releasePromoReservation({ squareOrderId: `${TAG}-release` });
        check("release marks the redemption RELEASED", released?.status === "RELEASED", `got ${released?.status}`);

        const afterRelease = await PromoCode.findById(releasable._id);
        check(
            "release decrements usedCount back to 0",
            afterRelease.usedCount === 0,
            `got ${afterRelease.usedCount}`
        );

        const redeemableAgain = await validatePromoForCart({
            code: releasable.code, userId: userA._id, lineItems: mixedCart,
        });
        check(
            "an abandoned checkout frees the code for the next customer",
            redeemableAgain.ok,
            `got ${redeemableAgain.code}`
        );

        /* A RELEASED record must free its per-user slot too, or the unique
           partial index would block the customer from ever retrying. */
        const retry = await reservePromoCode({
            promo: releasable, userId: userB._id, discountAmount: 5,
            squareOrderId: `${TAG}-retry`,
        });
        check(
            "the same customer can retry after abandoning (released slot is reusable)",
            retry.ok,
            `got ${retry.code}`
        );

        /* ── Summary ── */
        console.log(`\n${"─".repeat(58)}`);
        console.log(`${passed} passed, ${failed} failed`);
        console.log("─".repeat(58));
    } finally {
        /* ── Teardown: remove every fixture this script created ── */
        const promoIds = (await PromoCode.find({ description: TAG }).select("_id")).map((p) => p._id);
        await PromoRedemption.deleteMany({ promoCode: { $in: promoIds } });
        await PromoCode.deleteMany({ _id: { $in: promoIds } });
        await Order.deleteMany({ orderId: new RegExp(`^${TAG}`) });
        await Product.deleteMany({ description: TAG });
        await User.deleteMany({ name: new RegExp(`^${TAG}`) });
        if (user) await User.deleteOne({ _id: user._id });
        if (menProduct) await Product.deleteOne({ _id: menProduct._id });
        if (kidsProduct) await Product.deleteOne({ _id: kidsProduct._id });

        await mongoose.disconnect();
    }

    process.exit(failed === 0 ? 0 : 1);
};

run().catch((err) => {
    console.error("\nVerification crashed:", err);
    process.exit(1);
});
