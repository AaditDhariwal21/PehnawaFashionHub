import PromoCode from "../models/PromoCode.js";
import PromoRedemption from "../models/PromoRedemption.js";
import Product from "../models/Products.js";
import Order from "../models/Order.js";
import { findVariant } from "../utils/variants.js";

/**
 * Promo code validation, discount computation and usage accounting.
 *
 * Everything a caller needs lives here so that /api/promo/validate (advisory,
 * for the UI) and /api/payments/create-checkout (authoritative, takes the
 * money) run byte-identical rules. The "Apply" check is never trusted: the
 * cart can change between Apply and Pay, so create-checkout re-runs
 * validatePromoForCart() from scratch.
 */

/* Machine-readable failure reasons. The frontend maps these to copy; the
   human-readable `message` is a fallback, not the contract. */
export const PROMO_ERRORS = {
    CODE_REQUIRED: "PROMO_CODE_REQUIRED",
    CART_EMPTY: "PROMO_CART_EMPTY",
    NOT_FOUND: "PROMO_NOT_FOUND",
    INACTIVE: "PROMO_INACTIVE",
    NOT_STARTED: "PROMO_NOT_STARTED",
    EXPIRED: "PROMO_EXPIRED",
    MIN_ORDER_NOT_MET: "PROMO_MIN_ORDER_NOT_MET",
    LIMIT_REACHED: "PROMO_LIMIT_REACHED",
    USER_LIMIT_REACHED: "PROMO_USER_LIMIT_REACHED",
    FIRST_ORDER_ONLY: "PROMO_FIRST_ORDER_ONLY",
    NO_ELIGIBLE_ITEMS: "PROMO_NO_ELIGIBLE_ITEMS",
};

/**
 * A reservation whose customer never came back from Square. PendingOrder's own
 * TTL is 30 minutes; this sits comfortably past it so a slot is never released
 * while its checkout is still confirmable.
 */
const STALE_RESERVATION_MS = 45 * 60 * 1000;

/** Money is stored in dollars throughout this codebase, so round to cents. */
const round2 = (n) => Math.round(n * 100) / 100;

export const normalizeCode = (raw) =>
    String(raw || "").replace(/\s+/g, "").toUpperCase();

/* ══════════════════════════════════════════════════════════════
   Cart resolution
   ══════════════════════════════════════════════════════════════ */

/**
 * Turn a raw client cart into the priced line items the promo rules operate
 * on. Prices come from the product's variant — never from the request body,
 * which is the whole point: a client that could name its own prices could name
 * its own discount base.
 *
 * createCheckoutSession() already runs this resolution for its own reasons and
 * feeds the result straight into validatePromoForCart(), so it never calls
 * this. Only the advisory /api/promo/validate endpoint needs it.
 *
 * @returns {{ok: true, lineItems: Array}|{ok: false, message: string}}
 */
export const resolveCartForPromo = async (cartItems) => {
    if (!Array.isArray(cartItems) || cartItems.length === 0) {
        return { ok: false, message: "Cart is empty." };
    }

    const lineItems = [];

    for (const ci of cartItems) {
        const product = await Product.findById(ci.productId).select(
            "name gender category variants"
        );
        if (!product) {
            return { ok: false, message: `Product not found: ${ci.productId}` };
        }

        const variant = findVariant(product, ci.color || "", ci.size || "");
        if (!variant) {
            return {
                ok: false,
                message: `Variant ${ci.color || "?"} / ${ci.size || "?"} not available for "${product.name}".`,
            };
        }

        lineItems.push(toPromoLineItem(product, variant.price, Number(ci.quantity) || 1));
    }

    return { ok: true, lineItems };
};

/**
 * The shape the promo rules consume. Exported so createCheckoutSession() can
 * build the same structure inside its existing resolution loop instead of
 * re-querying every product.
 */
export const toPromoLineItem = (product, price, quantity) => ({
    productId: product._id,
    gender: product.gender,
    category: product.category,
    price,
    quantity,
});

/* ══════════════════════════════════════════════════════════════
   Scope + discount maths
   ══════════════════════════════════════════════════════════════ */

const isItemEligible = (promo, item) => {
    const excluded = (promo.excludedProductIds || []).some(
        (id) => id.toString() === item.productId.toString()
    );
    if (excluded) return false;

    const hasGenderScope = (promo.genders || []).length > 0;
    const hasCategoryScope = (promo.categories || []).length > 0;
    const hasProductScope = (promo.productIds || []).length > 0;

    // No scope at all = the code applies to the whole cart.
    if (!hasGenderScope && !hasCategoryScope && !hasProductScope) return true;

    // With several set, any one qualifying is enough — scopes widen the code,
    // they don't intersect to narrow it.
    const genderMatch =
        hasGenderScope && (promo.genders || []).includes(item.gender);
    const categoryMatch =
        hasCategoryScope && (promo.categories || []).includes(item.category);
    const productMatch =
        hasProductScope &&
        (promo.productIds || []).some((id) => id.toString() === item.productId.toString());

    return genderMatch || categoryMatch || productMatch;
};

const lineTotal = (item) => item.price * item.quantity;

/**
 * The discount always derives from the *eligible* line items, not the cart
 * total. A "20% off Kids" code on a cart of one Kids item and one Men's item
 * must discount only the Kids line.
 */
export const computeDiscount = (promo, eligibleSubtotal) => {
    let discount;

    if (promo.discountType === "PERCENTAGE") {
        discount = (eligibleSubtotal * promo.discountValue) / 100;
        if (promo.maxDiscountAmount !== null && promo.maxDiscountAmount !== undefined) {
            discount = Math.min(discount, promo.maxDiscountAmount);
        }
    } else {
        discount = promo.discountValue;
    }

    // Never discount more than the goods it applies to — a $50 flat code on a
    // $30 eligible subtotal is $30 off, not a $20 credit.
    return round2(Math.max(0, Math.min(discount, eligibleSubtotal)));
};

/* ══════════════════════════════════════════════════════════════
   Validation — the single source of truth
   ══════════════════════════════════════════════════════════════ */

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

/**
 * Runs the full rule set in the order a customer would expect to hear about
 * failures, returning the first violation with a distinguishable code.
 *
 * @param {object}  params
 * @param {string}  params.code      raw code as typed
 * @param {string}  params.userId
 * @param {Array}   params.lineItems from resolveCartForPromo()/toPromoLineItem()
 */
export const validatePromoForCart = async ({ code, userId, lineItems }) => {
    const normalized = normalizeCode(code);
    if (!normalized) {
        return fail(PROMO_ERRORS.CODE_REQUIRED, "Please enter a promo code.");
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return fail(PROMO_ERRORS.CART_EMPTY, "Your cart is empty.");
    }

    /* ── 1. Existence ── */
    const promo = await PromoCode.findOne({ code: normalized });
    if (!promo) {
        return fail(PROMO_ERRORS.NOT_FOUND, "This promo code doesn't exist.");
    }

    /* ── 2. Manual kill-switch ── */
    if (!promo.isActive) {
        return fail(PROMO_ERRORS.INACTIVE, "This promo code is no longer available.");
    }

    /* ── 3. Validity window — not-yet-started and expired are different
           facts and the customer should be told which. ── */
    const now = new Date();
    if (now < promo.validFrom) {
        return fail(PROMO_ERRORS.NOT_STARTED, "This promo code isn't active yet.", {
            validFrom: promo.validFrom,
        });
    }
    if (now > promo.validTill) {
        return fail(PROMO_ERRORS.EXPIRED, "This promo code has expired.", {
            validTill: promo.validTill,
        });
    }

    /* ── 4. Minimum order value, against the cart subtotal (shipping is not
           known this early in the flow and shouldn't count toward a
           merchandise threshold anyway). ── */
    const cartSubtotal = round2(lineItems.reduce((sum, i) => sum + lineTotal(i), 0));
    if (promo.minOrderValue > 0 && cartSubtotal < promo.minOrderValue) {
        return fail(
            PROMO_ERRORS.MIN_ORDER_NOT_MET,
            `Add ${round2(promo.minOrderValue - cartSubtotal)} more to use this code.`,
            { minOrderValue: promo.minOrderValue, cartSubtotal }
        );
    }

    /* ── 5. Total usage limit. Sweep abandoned checkouts first so a code
           isn't reported exhausted by slots nobody is holding. ── */
    if (promo.totalUsageLimit !== null && promo.totalUsageLimit !== undefined) {
        await releaseStaleReservations(promo._id);
        const fresh = await PromoCode.findById(promo._id).select("usedCount");
        if ((fresh?.usedCount ?? promo.usedCount) >= promo.totalUsageLimit) {
            return fail(
                PROMO_ERRORS.LIMIT_REACHED,
                "This promo code has been fully claimed."
            );
        }
    }

    /* ── 6. Per-user usage limit ── */
    const userUses = await PromoRedemption.countDocuments({
        promoCode: promo._id,
        user: userId,
        status: { $in: ["RESERVED", "CONFIRMED"] },
    });
    if (userUses >= promo.perUserUsageLimit) {
        return fail(
            PROMO_ERRORS.USER_LIMIT_REACHED,
            promo.perUserUsageLimit === 1
                ? "You've already used this promo code."
                : `You've reached the ${promo.perUserUsageLimit}-use limit on this code.`
        );
    }

    /* ── 7. First-order-only eligibility. Every Order in this system is
           created only after Square confirms payment, so any existing order
           means this isn't a first order. ── */
    if (promo.firstOrderOnly) {
        const previousOrders = await Order.countDocuments({ user: userId });
        if (previousOrders > 0) {
            return fail(
                PROMO_ERRORS.FIRST_ORDER_ONLY,
                "This promo code is only valid on your first order."
            );
        }
    }

    /* ── 8. Does anything in the cart actually qualify? ── */
    const eligibleItems = lineItems.filter((i) => isItemEligible(promo, i));
    if (eligibleItems.length === 0) {
        return fail(
            PROMO_ERRORS.NO_ELIGIBLE_ITEMS,
            "This code doesn't apply to any items in your cart."
        );
    }

    const eligibleSubtotal = round2(
        eligibleItems.reduce((sum, i) => sum + lineTotal(i), 0)
    );
    const discountAmount = computeDiscount(promo, eligibleSubtotal);

    return {
        ok: true,
        promo,
        code: promo.code,
        discountType: promo.discountType,
        discountAmount,
        cartSubtotal,
        eligibleSubtotal,
        subtotalAfterDiscount: round2(cartSubtotal - discountAmount),
        appliesToWholeCart: eligibleItems.length === lineItems.length,
    };
};

/* ══════════════════════════════════════════════════════════════
   Usage accounting
   ══════════════════════════════════════════════════════════════ */

/**
 * Consume one usage slot. Called from createCheckoutSession() — i.e. at the
 * moment the discount is written into the Square payment link, which is the
 * moment the customer becomes able to pay the discounted amount.
 *
 * The global limit is enforced by a single conditional findOneAndUpdate whose
 * filter contains `usedCount: { $lt: limit }`. Mongo evaluates that filter
 * against the document at write time under a per-document lock, so two
 * requests that both read usedCount = 99 against a limit of 100 cannot both
 * match — the loser gets null back, not a second increment.
 *
 * The per-user limit is enforced by the unique partial index on
 * (promoCode, user, slot): concurrent requests compute the same slot number
 * and exactly one insert survives.
 */
export const reservePromoCode = async ({ promo, userId, discountAmount, squareOrderId }) => {
    const now = new Date();

    /* Re-assert the whole gate inside the filter, not just the counter. An
       admin deactivating a code between validation and reservation should stop
       the reservation too. */
    const filter = {
        _id: promo._id,
        isActive: true,
        validFrom: { $lte: now },
        validTill: { $gte: now },
    };
    if (promo.totalUsageLimit !== null && promo.totalUsageLimit !== undefined) {
        filter.usedCount = { $lt: promo.totalUsageLimit };
    }

    const claimed = await PromoCode.findOneAndUpdate(
        filter,
        { $inc: { usedCount: 1 } },
        { new: true }
    );

    if (!claimed) {
        return { ok: false, code: PROMO_ERRORS.LIMIT_REACHED, message: "This promo code has been fully claimed." };
    }

    /* From here on, any failure must hand the slot back. */
    const rollback = () =>
        PromoCode.updateOne({ _id: promo._id }, { $inc: { usedCount: -1 } });

    const heldSlots = await PromoRedemption.countDocuments({
        promoCode: promo._id,
        user: userId,
        status: { $in: ["RESERVED", "CONFIRMED"] },
    });

    if (heldSlots >= promo.perUserUsageLimit) {
        await rollback();
        return {
            ok: false,
            code: PROMO_ERRORS.USER_LIMIT_REACHED,
            message: "You've already used this promo code.",
        };
    }

    try {
        const redemption = await PromoRedemption.create({
            promoCode: promo._id,
            code: promo.code,
            user: userId,
            squareOrderId,
            discountAmount,
            status: "RESERVED",
            slot: heldSlots,
        });
        return { ok: true, redemption };
    } catch (error) {
        await rollback();

        // E11000 = the unique partial index rejected us, i.e. a concurrent
        // checkout by this same user took the slot first.
        if (error?.code === 11000) {
            return {
                ok: false,
                code: PROMO_ERRORS.USER_LIMIT_REACHED,
                message: "You've already used this promo code.",
            };
        }
        throw error;
    }
};

/**
 * RESERVED → CONFIRMED once the Order exists.
 *
 * Order creation races between confirmPayment() and the Square webhook, so
 * this must be idempotent: the status filter means the second caller updates
 * nothing and reports the already-confirmed redemption.
 */
export const confirmPromoRedemption = async ({ squareOrderId, orderId }) => {
    if (!squareOrderId) return null;

    const confirmed = await PromoRedemption.findOneAndUpdate(
        { squareOrderId, status: "RESERVED" },
        { $set: { status: "CONFIRMED", order: orderId } },
        { new: true }
    );

    if (confirmed) return confirmed;

    // Either the other path already confirmed it, or there was no promo.
    return PromoRedemption.findOne({ squareOrderId, status: "CONFIRMED" });
};

/**
 * Hand a slot back. Used when a checkout session could not be created after
 * the reservation was taken, and by the stale sweep below.
 */
export const releasePromoReservation = async ({ squareOrderId, redemptionId }) => {
    const filter = { status: "RESERVED" };
    if (redemptionId) filter._id = redemptionId;
    else if (squareOrderId) filter.squareOrderId = squareOrderId;
    else return null;

    const released = await PromoRedemption.findOneAndUpdate(
        filter,
        { $set: { status: "RELEASED", releasedAt: new Date() } },
        { new: true }
    );

    if (released) {
        await PromoCode.updateOne(
            { _id: released.promoCode, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } }
        );
    }

    return released;
};

/**
 * Reclaim slots from customers who never came back from Square's hosted page.
 *
 * PendingOrder relies on a Mongo TTL index, and TTL deletion fires no
 * application hook — so without this sweep an abandoned checkout would hold a
 * usage slot on a limited code forever. Called opportunistically from the
 * validation path (cheap, indexed) rather than requiring a cron process; the
 * standalone script in scripts/releaseStalePromoReservations.js runs the same
 * logic if you'd rather schedule it.
 *
 * @param {ObjectId} [promoCodeId] limit the sweep to one code
 */
export const releaseStaleReservations = async (promoCodeId = null) => {
    const cutoff = new Date(Date.now() - STALE_RESERVATION_MS);
    const filter = { status: "RESERVED", createdAt: { $lt: cutoff } };
    if (promoCodeId) filter.promoCode = promoCodeId;

    const stale = await PromoRedemption.find(filter).select("_id").limit(200);

    let releasedCount = 0;
    for (const s of stale) {
        const released = await releasePromoReservation({ redemptionId: s._id });
        if (released) releasedCount += 1;
    }

    return releasedCount;
};
