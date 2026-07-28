import PromoCode from "../models/PromoCode.js";
import PromoRedemption from "../models/PromoRedemption.js";
import {
    validatePromoForCart,
    resolveCartForPromo,
    normalizeCode,
    releaseStaleReservations,
} from "../services/promoService.js";

/* ══════════════════════════════════════════════════════════════
   POST /api/promo/validate

   Called when the customer clicks "Apply". Advisory only — it runs
   the full rule set and returns the computed discount, but takes no
   usage slot. createCheckoutSession() re-validates from scratch
   before any money moves, because the cart can change in between.
   ══════════════════════════════════════════════════════════════ */
export const validatePromoCode = async (req, res) => {
    try {
        const { code, cartItems } = req.body || {};

        const resolved = await resolveCartForPromo(cartItems);
        if (!resolved.ok) {
            return res.status(400).json({ success: false, message: resolved.message });
        }

        const result = await validatePromoForCart({
            code,
            userId: req.user.id,
            lineItems: resolved.lineItems,
        });

        if (!result.ok) {
            /* `code` here is the machine-readable failure reason. Existing
               endpoints in this app return only `message`; promo adds `code`
               so the UI can show a specific explanation rather than a generic
               "invalid code". */
            return res.status(400).json({
                success: false,
                code: result.code,
                message: result.message,
                minOrderValue: result.minOrderValue,
                cartSubtotal: result.cartSubtotal,
            });
        }

        return res.json({
            success: true,
            promo: {
                code: result.code,
                discountType: result.discountType,
                discountAmount: result.discountAmount,
                cartSubtotal: result.cartSubtotal,
                eligibleSubtotal: result.eligibleSubtotal,
                subtotalAfterDiscount: result.subtotalAfterDiscount,
                appliesToWholeCart: result.appliesToWholeCart,
            },
        });
    } catch (error) {
        console.error("validatePromoCode error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error validating promo code.",
            error: error.message,
        });
    }
};

/* ══════════════════════════════════════════════════════════════
   Admin CRUD — mounted under /api/adminDashboard/promocodes,
   behind the existing verifyToken + isAdmin middleware.
   ══════════════════════════════════════════════════════════════ */

/** Absent stays absent; an explicitly blank value means "no limit" (null). */
const numberOrNull = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    return Number(v);
};

const numberOrUndefined = (v) => (v === undefined ? undefined : Number(v));

/** Fields an admin is allowed to set. Anything else in the body is ignored —
    notably usedCount, which is owned by the reservation machinery. */
const pickPromoFields = (body) => {
    const candidates = {
        code: body.code,
        description: body.description,
        discountType: body.discountType,
        discountValue: numberOrUndefined(body.discountValue),
        maxDiscountAmount: numberOrNull(body.maxDiscountAmount),
        minOrderValue: numberOrUndefined(body.minOrderValue),
        validFrom: body.validFrom,
        validTill: body.validTill,
        totalUsageLimit: numberOrNull(body.totalUsageLimit),
        perUserUsageLimit: numberOrUndefined(body.perUserUsageLimit),
        genders: body.genders,
        categories: body.categories,
        productIds: body.productIds,
        excludedProductIds: body.excludedProductIds,
        firstOrderOnly: body.firstOrderOnly,
        isActive: body.isActive,
    };

    return Object.fromEntries(
        Object.entries(candidates).filter(([, value]) => value !== undefined)
    );
};

/* ── GET /api/adminDashboard/promocodes ── */
export const getPromoCodes = async (req, res) => {
    try {
        /* Sweep first so the usedCount column reflects slots actually held
           rather than abandoned checkouts. */
        await releaseStaleReservations();

        const promoCodes = await PromoCode.find().sort({ createdAt: -1 });
        return res.json({ success: true, promoCodes });
    } catch (error) {
        console.error("getPromoCodes error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error fetching promo codes.",
            error: error.message,
        });
    }
};

/* ── POST /api/adminDashboard/promocodes ── */
export const createPromoCode = async (req, res) => {
    try {
        const fields = pickPromoFields(req.body || {});

        for (const required of ["code", "discountType", "discountValue", "validFrom", "validTill"]) {
            if (fields[required] === undefined || fields[required] === "") {
                return res.status(400).json({
                    success: false,
                    message: `${required} is required.`,
                });
            }
        }

        const normalized = normalizeCode(fields.code);
        const existing = await PromoCode.findOne({ code: normalized });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: `Promo code "${normalized}" already exists.`,
            });
        }

        const promoCode = await PromoCode.create({ ...fields, createdBy: req.user.id });
        return res.status(201).json({ success: true, promoCode });
    } catch (error) {
        console.error("createPromoCode error:", error);
        /* Mongoose validation, including the cross-field invariants raised by
           the pre-validate hook, is bad input — 400, not 500. */
        if (error.name === "ValidationError") {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: "That promo code already exists." });
        }
        return res.status(500).json({
            success: false,
            message: "Server error creating promo code.",
            error: error.message,
        });
    }
};

/* ── PUT /api/adminDashboard/promocodes/:id ── */
export const updatePromoCode = async (req, res) => {
    try {
        const promoCode = await PromoCode.findById(req.params.id);
        if (!promoCode) {
            return res.status(404).json({ success: false, message: "Promo code not found." });
        }

        const fields = pickPromoFields(req.body || {});

        if (fields.code) {
            const normalized = normalizeCode(fields.code);
            const clash = await PromoCode.findOne({ code: normalized, _id: { $ne: promoCode._id } });
            if (clash) {
                return res.status(400).json({
                    success: false,
                    message: `Promo code "${normalized}" already exists.`,
                });
            }
        }

        /* Guard against retroactively shrinking the limit below what has
           already been handed out — that would leave usedCount above the cap
           and make the counter meaningless. */
        if (
            fields.totalUsageLimit !== undefined &&
            fields.totalUsageLimit !== null &&
            fields.totalUsageLimit < promoCode.usedCount
        ) {
            return res.status(400).json({
                success: false,
                message: `This code has already been used ${promoCode.usedCount} time(s); the total limit cannot be lower than that. Deactivate it instead.`,
            });
        }

        Object.assign(promoCode, fields);
        await promoCode.save();

        return res.json({ success: true, promoCode });
    } catch (error) {
        console.error("updatePromoCode error:", error);
        if (error.name === "ValidationError") {
            return res.status(400).json({ success: false, message: error.message });
        }
        return res.status(500).json({
            success: false,
            message: "Server error updating promo code.",
            error: error.message,
        });
    }
};

/* ── PATCH /api/adminDashboard/promocodes/:id/deactivate ──
   Deactivation rather than deletion: redemption records reference the code,
   and pulling a live promo shouldn't destroy the audit trail behind orders
   that already used it. */
export const setPromoCodeActive = async (req, res) => {
    try {
        const { isActive } = req.body || {};
        if (typeof isActive !== "boolean") {
            return res.status(400).json({ success: false, message: "isActive must be a boolean." });
        }

        const promoCode = await PromoCode.findByIdAndUpdate(
            req.params.id,
            { $set: { isActive } },
            { new: true }
        );
        if (!promoCode) {
            return res.status(404).json({ success: false, message: "Promo code not found." });
        }

        return res.json({ success: true, promoCode });
    } catch (error) {
        console.error("setPromoCodeActive error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error updating promo code.",
            error: error.message,
        });
    }
};

/* ── GET /api/adminDashboard/promocodes/:id/redemptions ──
   The queryable audit trail: who redeemed this code, when, for how much,
   and on which order. */
export const getPromoRedemptions = async (req, res) => {
    try {
        const redemptions = await PromoRedemption.find({ promoCode: req.params.id })
            .populate("user", "name email")
            .populate("order", "orderId totalAmount")
            .sort({ createdAt: -1 });

        return res.json({ success: true, redemptions });
    } catch (error) {
        console.error("getPromoRedemptions error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error fetching redemptions.",
            error: error.message,
        });
    }
};
