import mongoose from "mongoose";

/**
 * One document per redemption attempt — the audit trail behind
 * PromoCode.usedCount. A bare counter can't answer "who redeemed this, when,
 * and on which order?", which is exactly what support disputes and abuse
 * investigations need.
 *
 * Lifecycle mirrors this codebase's two-phase Square checkout:
 *
 *   RESERVED   created by /api/payments/create-checkout, at the moment the
 *              discount is baked into the Square payment link. Holds a usage
 *              slot so a limited code can't be over-issued to customers who
 *              are then charged a discount they weren't entitled to.
 *   CONFIRMED  the order actually exists — set by whichever of
 *              confirmPayment() or the Square webhook wins the race.
 *   RELEASED   the customer abandoned the hosted checkout page. The slot is
 *              returned to the pool but the record is kept.
 */
const promoRedemptionSchema = new mongoose.Schema(
    {
        promoCode: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PromoCode",
            required: true,
            index: true,
        },
        /** Denormalised so the audit trail survives a code being deleted. */
        code: {
            type: String,
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        /**
         * Set on CONFIRMED. Null while RESERVED — at reserve time the Order
         * does not exist yet (it is created only after Square confirms
         * payment), so squareOrderId below is the join key that spans both
         * phases.
         */
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null,
        },
        /**
         * The durable link between a reservation and the order it becomes.
         * PendingOrder is deleted on confirmation, so its _id can't serve as
         * the key, but squareOrderId is carried through into
         * Order.paymentResult.squareOrderId.
         *
         * Null for a brief window: the slot has to be claimed *before* the
         * discounted Square payment link is created, otherwise a failed
         * reservation would leave a live link offering a discount nobody is
         * holding a slot for. It's patched in as soon as Square returns the
         * order id, and the stale sweep reclaims any reservation that never
         * got one (e.g. the process died mid-checkout).
         */
        squareOrderId: {
            type: String,
            default: null,
            index: true,
        },
        discountAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        status: {
            type: String,
            enum: ["RESERVED", "CONFIRMED", "RELEASED"],
            default: "RESERVED",
            index: true,
        },
        /**
         * Which of this user's allowed uses this document occupies (0-based).
         * Assigned as the count of the user's currently-held slots, so two
         * concurrent checkouts both compute the same value and the unique
         * index below lets exactly one of them insert. That is what makes the
         * per-user limit race-safe rather than merely check-then-write.
         */
        slot: {
            type: Number,
            required: true,
            min: 0,
        },
        releasedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

/**
 * Enforces perUserUsageLimit at the database level. Partial on the two
 * slot-holding states so that RELEASED documents drop out of the index
 * entirely — their slot is freed for reuse while the record is retained for
 * auditing.
 */
promoRedemptionSchema.index(
    { promoCode: 1, user: 1, slot: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: ["RESERVED", "CONFIRMED"] } },
    }
);

/** Drives the stale-reservation sweep. */
promoRedemptionSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model("PromoRedemption", promoRedemptionSchema);
