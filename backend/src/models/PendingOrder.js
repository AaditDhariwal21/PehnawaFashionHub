import mongoose from "mongoose";

/**
 * Stores checkout session data between Square redirect and payment confirmation.
 * Auto-deletes after 30 minutes via TTL index.
 */
const pendingOrderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
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
            expires: 1800, // TTL: auto-delete after 30 minutes
        },
    },
);

export default mongoose.model("PendingOrder", pendingOrderSchema);
