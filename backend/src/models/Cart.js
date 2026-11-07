import mongoose from "mongoose";

/**
 * A logged-in customer's saved cart. Guests keep theirs in localStorage only.
 *
 * Lines store identity and quantity — never price, name or image. Those are
 * read from the product every time the cart is loaded (see
 * CartController.hydrateCart), so the cart can't show a price that has since
 * changed, and nothing a client sends can set one.
 */
const cartLineSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        color: { type: String, default: "" },
        size: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        addedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

const cartSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },
        items: [cartLineSchema],
    },
    {
        timestamps: true,
        /* Two tabs or devices editing the same cart: a save based on a stale
           read fails with a VersionError instead of silently overwriting the
           other's change, and the controller retries against a fresh read. */
        optimisticConcurrency: true,
    }
);

export default mongoose.model("Cart", cartSchema);
