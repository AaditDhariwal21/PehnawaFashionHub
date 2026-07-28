import mongoose from "mongoose";
import { GENDERS, ALL_CATEGORIES } from "../config/productTaxonomy.js";

/**
 * A discount code an admin creates and a customer applies at checkout.
 *
 * Money fields are stored in dollars (matching Product.variants[].price and
 * Order.subtotal) — never cents. Conversion to cents happens only at the
 * Square boundary.
 */
const promoCodeSchema = new mongoose.Schema(
    {
        /**
         * Codes are compared case-insensitively, which we implement by
         * normalising to uppercase on the way in (see the pre-validate hook)
         * rather than by using a case-insensitive collation. That keeps the
         * unique index a plain B-tree lookup and means the stored value is
         * always the canonical one.
         */
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        description: {
            type: String,
            default: "",
        },
        discountType: {
            type: String,
            enum: ["PERCENTAGE", "FLAT"],
            required: true,
        },
        /** Percent (0–100) when PERCENTAGE, dollars when FLAT. */
        discountValue: {
            type: Number,
            required: true,
            min: 0,
        },
        /**
         * Ceiling on the computed discount for PERCENTAGE codes — "20% off,
         * up to $50". Meaningless for FLAT codes, where discountValue is
         * already the cap; the pre-validate hook forces it to null there so
         * the two fields can't drift into contradicting each other.
         */
        maxDiscountAmount: {
            type: Number,
            default: null,
            min: 0,
        },
        /** Evaluated against the cart subtotal, before shipping. */
        minOrderValue: {
            type: Number,
            default: 0,
            min: 0,
        },
        validFrom: {
            type: Date,
            required: true,
        },
        validTill: {
            type: Date,
            required: true,
        },
        /** null = unlimited redemptions across all users. */
        totalUsageLimit: {
            type: Number,
            default: null,
            min: 1,
        },
        perUserUsageLimit: {
            type: Number,
            default: 1,
            min: 1,
        },
        /**
         * Counts RESERVED + CONFIRMED redemptions. Incremented by a single
         * conditional $inc guarded on `usedCount < totalUsageLimit`, which is
         * what makes a limited code safe against concurrent checkouts — see
         * reservePromoCode() in services/promoService.js. Decremented when a
         * reservation is released.
         */
        usedCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        /* ── Applicability scope ──
           All are empty/absent by default, which means "the whole cart is
           eligible". The scopes widen rather than intersect: an item qualifies
           if it matches ANY populated scope.

           `genders` supports whole-demographic coupons ("20% off all Women's"),
           which the previous flat design could not express — gender was fused
           into the category string. */
        genders: [{ type: String, enum: GENDERS }],
        /* Exact Product.category values, validated against the taxonomy on
           write. These are denormalised strings rather than references, so any
           category rename must rewrite them in the same migration — otherwise a
           scoped code silently stops discounting anything. */
        categories: [{ type: String, trim: true, enum: ALL_CATEGORIES }],
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
        excludedProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

        firstOrderOnly: {
            type: Boolean,
            default: false,
        },
        /**
         * Manual kill-switch, deliberately independent of the validity window
         * so support can pull a live code instantly without rewriting dates
         * (and without that edit looking like an expiry in the audit trail).
         */
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

promoCodeSchema.pre("validate", function () {
    if (this.code) {
        // Strip internal whitespace too — users paste codes with stray spaces.
        this.code = this.code.replace(/\s+/g, "").toUpperCase();
    }

    // A cap on a flat discount is a contradiction; keep the field null so
    // discount computation never has to reason about which one wins.
    if (this.discountType === "FLAT") {
        this.maxDiscountAmount = null;
    }
});

/**
 * Cross-field invariants. Raised via invalidate() rather than by throwing so
 * they arrive as a normal Mongoose ValidationError and the controller can map
 * them to a 400 alongside the field-level validators, instead of having to
 * special-case a bare Error.
 */
promoCodeSchema.pre("validate", function () {
    if (this.validFrom && this.validTill && this.validTill <= this.validFrom) {
        this.invalidate("validTill", "Valid-till must be after valid-from.");
    }
    if (this.discountType === "PERCENTAGE" && this.discountValue > 100) {
        this.invalidate("discountValue", "A percentage discount cannot exceed 100.");
    }
});

export default mongoose.model("PromoCode", promoCodeSchema);
