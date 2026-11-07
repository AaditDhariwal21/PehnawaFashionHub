import mongoose from "mongoose";

/**
 * Stores checkout session data between Square redirect and payment confirmation.
 *
 * Lifetime: kept for 7 days (TTL index on createdAt, managed by
 * config/indexMigrations.js rather than declared here — see below), not 30
 * minutes as before. A Square payment link does not expire on its own, so a
 * customer who paid after the old 30-minute TTL had already deleted this
 * record was charged with no order created. Abandoned checkouts are instead
 * handled by services/pendingOrderSweeper.js, which deactivates the Square
 * payment link after an hour; the record itself lingers for the rest of the
 * week only so that a payment racing that deactivation still becomes an order.
 *
 * The TTL index is not declared with `expires` on the field because changing
 * an existing TTL index's duration requires dropping and recreating it, which
 * Mongoose's automatic index build cannot do (it would report an options
 * conflict instead). The startup migration does it explicitly and idempotently.
 */
const pendingOrderSchema = new mongoose.Schema(
    {
        /** Absent for guest checkouts. */
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: function () {
                return !this.isGuest;
            },
        },
        isGuest: {
            type: Boolean,
            default: false,
        },
        /** Email entered at checkout; copied onto the Order. */
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        /** Guest-only. See utils/guestAccess.js. */
        guest: {
            emailKey: { type: String },
            accessTokenHash: { type: String, select: false, index: true },
        },
        /**
         * Client-generated idempotency key for create-checkout. A retried or
         * double-submitted request with the same key gets the same payment
         * link back instead of a second one. Partial so records created before
         * this field existed are not in the index.
         */
        checkoutAttemptId: {
            type: String,
        },
        /** Digest of the request a checkoutAttemptId was first used with. */
        requestFingerprint: { type: String },
        /** Returned again on an idempotent replay. */
        checkoutUrl: { type: String },
        /**
         * 'cart' — bought from the cart, so a logged-in buyer's saved cart has
         * those lines removed once the order exists. 'buyNow' — a one-off
         * purchase that leaves the saved cart alone.
         */
        source: {
            type: String,
            enum: ["cart", "buyNow"],
            default: "cart",
        },
        /** Set by the sweeper when it deactivated an unpaid payment link. */
        linkDeactivatedAt: {
            type: Date,
            default: null,
        },
        paymentLinkId: {
            type: String,
            required: true,
            unique: true,
        },
        squareOrderId: {
            type: String,
            required: true,
            /* Queried by the webhook and by the processing lease; was an
               unindexed collection scan before. */
            index: true,
        },
        /**
         * Processing lease. Set when a trigger claims this checkout to turn it
         * into an order, so the confirm endpoint and the Square webhooks (which
         * can all fire for the same payment, and of which Square may deliver
         * two) cannot each do the work. See claimPendingOrder() in
         * services/orderCreation.js. Null means unclaimed; a timestamp older
         * than the lease window means the previous holder died and the work may
         * be retried.
         */
        processingStartedAt: {
            type: Date,
            default: null,
        },
        cartItems: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
                image: { type: String, default: "" },
                size: { type: String, default: "" },
                color: { type: String, default: "" },
                quantity: { type: Number, required: true, min: 1 },
            },
        ],
        shippingAddress: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            addressLine1: { type: String, required: true },
            addressLine2: { type: String, default: "" },
            city: { type: String, required: true },
            state: { type: String, required: true },
            zipCode: { type: String, required: true },
            country: { type: String, default: "United States" },
        },
        subtotal: { type: Number, required: true },
        /**
         * Discount already baked into the Square payment link. Carried here so
         * the order created on confirmation records the same figures the
         * customer was actually charged, and so totalAmount (which the
         * amount-verification step compares against Square) reflects it.
         */
        discountAmount: { type: Number, default: 0 },
        promo: {
            promoCodeId: { type: mongoose.Schema.Types.ObjectId, ref: "PromoCode" },
            code: { type: String },
            discountType: { type: String },
        },
        shippingCost: { type: Number, required: true },
        totalAmount: { type: Number, required: true },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
);

pendingOrderSchema.index(
    { checkoutAttemptId: 1 },
    {
        unique: true,
        partialFilterExpression: { checkoutAttemptId: { $type: "string" } },
    }
);

export default mongoose.model("PendingOrder", pendingOrderSchema);
