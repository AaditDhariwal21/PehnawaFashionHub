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
