import mongoose from "mongoose";
import crypto from "crypto";

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
        /**
         * Server-computed promo discount. Order arithmetic is
         * subtotal - discountAmount + shippingCost = totalAmount.
         * Defaults to 0 so every pre-promo order stays consistent with that.
         */
        discountAmount: {
            type: Number,
            default: 0,
        },
        /** Which code produced discountAmount. Absent when none was used. */
        promo: {
            promoCodeId: { type: mongoose.Schema.Types.ObjectId, ref: "PromoCode" },
            code: { type: String },
            discountType: { type: String },
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

/**
 * One order per Square order, enforced by the database rather than by an
 * application-level findOne check.
 *
 * The confirm endpoint and the Square payment.created/payment.updated webhooks
 * can all fire for a single payment. Each used to check for an existing order
 * and then do several hundred milliseconds of work before inserting, so two
 * triggers could both pass the check and both insert. `orderId` being unique did
 * not help: it is derived from Date.now(), so a collision required landing in
 * the same millisecond.
 *
 * Partial on `$type: "string"` so orders that carry no paymentResult at all —
 * records predating the Square integration — are excluded from the index
 * instead of colliding with each other on null.
 *
 * This is the backstop. The primary defence is the processing lease taken on
 * PendingOrder before any of that work begins; see services/orderCreation.js.
 */
orderSchema.index(
    { "paymentResult.squareOrderId": 1 },
    {
        unique: true,
        partialFilterExpression: {
            "paymentResult.squareOrderId": { $type: "string" },
        },
    }
);

/**
 * Generate orderId before save.
 *
 * The millisecond timestamp alone was not safe against the unique index above:
 * two orders created in the same millisecond collided. That mattered more than
 * it looks, because the order-creation handlers treat a duplicate-key error as
 * "another trigger already created this order" — so an orderId collision could
 * be misread as a duplicate and a genuinely paid order silently dropped. The
 * handlers now distinguish which index rejected them (see
 * isDuplicateSquareOrderError in services/orderCreation.js), and this makes the
 * collision effectively impossible in the first place.
 *
 * The timestamp is kept as the leading component so new ids stay recognisable
 * alongside existing ones and remain roughly sortable by age, with three random
 * bytes (16.7M values per millisecond) appended.
 */
orderSchema.pre("save", function () {
    if (!this.orderId) {
        const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
        this.orderId = `PHN-${Date.now()}-${suffix}`;
    }
});

export default mongoose.model("Order", orderSchema);
