import mongoose from "mongoose";
import { generateSlug, ensureUniqueSlug } from "../utils/slug.js";
import {
    GENDERS,
    SPECIAL_TAGS,
    isValidCategoryForGender,
} from "../config/productTaxonomy.js";

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
        /**
         * Demographic facet. Independently queryable, which the previous design
         * could not do — gender was fused into the category string
         * ("Men's Kurta") and otherwise existed only in a hardcoded nav array.
         */
        gender: {
            type: String,
            enum: GENDERS,
            required: function () {
                return !this.needsReclassification;
            },
            index: true,
        },
        /**
         * Nested under gender: the value must be a member of this product's
         * gender's list. Validated at the schema level rather than only by a
         * constrained admin dropdown, so a direct database write or a future
         * code path that bypasses the UI still cannot create an invalid pair.
         *
         * Note for query-based writes: Mongoose only runs this validator on
         * findOneAndUpdate/updateOne when `runValidators: true` AND
         * `context: "query"` are passed, and even then `this` is the query, not
         * the document — so the validator falls back to reading gender out of
         * the update payload. Prefer doc.save() on this model.
         */
        category: {
            type: String,
            required: function () {
                return !this.needsReclassification;
            },
            validate: {
                validator: function (value) {
                    /* Products awaiting manual classification legitimately have
                       neither field set. */
                    if (this.needsReclassification && !value) return true;

                    const gender = typeof this.get === "function"
                        ? this.get("gender")
                        : (this.gender ?? this._update?.$set?.gender ?? this._update?.gender);

                    return isValidCategoryForGender(gender, value);
                },
                message: function (props) {
                    return `"${props.value}" is not a valid category for this product's gender.`;
                },
            },
            index: true,
        },
        /**
         * Set when a product could not be migrated to the gender/category
         * taxonomy without a human decision. Such products keep gender and
         * category UNSET rather than being defaulted to a guess, so they can
         * never silently masquerade as correctly classified — and
         * `find({ needsReclassification: true })` is the one query that lists
         * everything still outstanding.
         */
        needsReclassification: {
            type: Boolean,
            default: false,
            index: true,
        },
        /**
         * Independent, optional, multi-value facet. NOT a category: these must
         * never appear in category navigation or category filters. Manual admin
         * toggles only — no auto-expiry, no derivation from discount state.
         */
        specialTags: {
            type: [String],
            enum: SPECIAL_TAGS,
            default: [],
        },
        /**
         * DEPRECATED — superseded by `gender` + `category`.
         *
         * Retained only for the transition window: the migration reads it to
         * derive Kids → Boys/Girls, and keeping it means existing read paths
         * don't break between the schema change and the code changes. Nothing
         * new should write it. Remove once every product has migrated and the
         * remaining readers are updated.
         */
        subCategory: {
            type: String,
            enum: ["Boys", "Girls", null],
            default: null,
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
        /**
         * DEPRECATED — superseded by the multi-value `specialTags`.
         *
         * Retained for the transition window so the migration can read it and
         * so the existing New Arrivals / Bestsellers rails keep working until
         * they are re-pointed. Note the value set differs: this field also
         * carried "Trending" (now removed entirely) and spelled it
         * "Best Seller", where the new enum uses "Bestseller".
         */
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
    if (!this.categorySlug && this.category) {
        this.categorySlug = generateSlug(this.category);
    }

    /* The old "Kids products default to Girls" invariant is gone, deliberately.
       It silently invented data: a Kids product saved without a subCategory
       became Girls, which is exactly why a stored "Girls" cannot be trusted as
       an admin's actual choice and why those products go to manual review
       rather than being auto-migrated. Nothing should write subCategory now —
       gender + category carry that meaning. */
});

productSchema.virtual("totalStock").get(function () {
    return (this.variants || []).reduce(
        (sum, v) => sum + (Number(v.stock) || 0),
        0
    );
});

export default mongoose.model("Product", productSchema);
