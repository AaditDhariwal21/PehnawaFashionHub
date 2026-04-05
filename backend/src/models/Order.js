import mongoose from "mongoose";

/* ── Embedded: Order Item ── */
const orderItemSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        image: { type: String, default: "" },
        size: { type: String, default: "" },
        color: { type: String, default: "" },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

/* ── Embedded: Shipping Address ── */
const shippingAddressSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        addressLine1: { type: String, required: true },
        addressLine2: { type: String, default: "" },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, default: "United States" },
    },
    { _id: false }
);

/* ── Main Order Schema ── */
const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            unique: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        items: [orderItemSchema],
        shippingAddress: shippingAddressSchema,
        paymentMethod: {
            type: String,
            default: "Square",
        },
        paymentResult: {
            squareOrderId: { type: String },
            squarePaymentId: { type: String },
            status: { type: String },
        },
        subtotal: {
            type: Number,
            required: true,
        },
        shippingCost: {
            type: Number,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        orderStatus: {
            type: String,
            enum: ["Pending", "Paid", "Processing", "Shipped", "Delivered", "Cancelled"],
            default: "Pending",
        },
        isPaid: {
            type: Boolean,
            default: false,
        },
        paidAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

/* Generate orderId before save */
orderSchema.pre("save", function () {
    if (!this.orderId) {
        this.orderId = `PHN-${Date.now()}`;
    }
});

export default mongoose.model("Order", orderSchema);
