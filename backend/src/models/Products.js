import mongoose from "mongoose";
import { generateSlug, ensureUniqueSlug } from "../utils/slug.js";

const colorImageSchema = new mongoose.Schema(
    {
        colorName: { type: String, required: true },
        images: [
            {
                url: { type: String, required: true },
                publicId: { type: String, required: true },
            },
        ],
    },
    { _id: false }
);

/**
 * A variant is a unique (color, size) combination with its own
 * price and stock. This is the unit of inventory and pricing —
 * the single source of truth for stock across the entire system.
 */
const variantSchema = new mongoose.Schema(
    {
        color: { type: String, required: true, trim: true },
        size: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        stock: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const productSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        shortDescription: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            required: true,
        },
        price: {
            type: Number, // MRP — used for strikethrough only
            required: true,
        },
        category: {
            type: String,
            required: true,
        },
        slug: {
            type: String,
            unique: true,
            index: true,
            sparse: true,
        },
        categorySlug: {
            type: String,
            index: true,
        },
        images: [
            {
                url: { type: String, required: true },
                publicId: { type: String, required: true },
            },
        ],
        colors: [colorImageSchema],
        variants: [variantSchema],
        weight: {
            type: Number,
            required: true,
        },
        specialTag: {
            type: String,
            default: null,
        },
        isCategoryCover: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

/**
 * `totalStock` is a derived quantity, not a stored field. Defining it
 * as a virtual guarantees it can never drift from `variants[].stock`,
 * and `toJSON: { virtuals: true }` ensures every API response includes
 * the correct value automatically.
 */
/**
 * Slug stability policy: slugs are assigned exactly once, on the
 * document's first save, and never recomputed afterwards. This holds
 * the URL stable across name and category renames — a hard requirement
 * for SEO and shared links.
 */
productSchema.pre("save", async function () {
    if (!this.slug) {
        const base = generateSlug(this.name);
        this.slug = await ensureUniqueSlug(this.constructor, base, this._id);
    }
    if (!this.categorySlug) {
        this.categorySlug = generateSlug(this.category);
    }
});

productSchema.virtual("totalStock").get(function () {
    return (this.variants || []).reduce(
        (sum, v) => sum + (Number(v.stock) || 0),
        0
    );
});

export default mongoose.model("Product", productSchema);
