import Product from "../models/Products.js";
import { validateVariants } from "../utils/variants.js";
import {
    GENDERS,
    ALL_CATEGORIES,
    CATEGORIES_BY_GENDER,
    SPECIAL_TAGS,
    isValidCategoryForGender,
} from "../config/productTaxonomy.js";

/**
 * Escape a user-supplied string before it goes anywhere near a RegExp.
 * Free-text search still needs substring matching, so unlike the category
 * filters it can't be reduced to an exact lookup.
 */
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Validate a gender/category pair for a write.
 * @returns {string|null} an error message, or null when the pair is valid.
 */
const validateGenderCategory = (gender, category) => {
    if (!GENDERS.includes(gender)) {
        return `Gender must be one of: ${GENDERS.join(", ")}.`;
    }
    if (!isValidCategoryForGender(gender, category)) {
        return `"${category}" is not a valid category for ${gender}. Allowed: ${CATEGORIES_BY_GENDER[gender].join(", ")}.`;
    }
    return null;
};

/**
 * Coerce and validate the special tags payload. Accepts an array, a single
 * string, or nothing — the field is optional and independent of gender and
 * category.
 * @returns {{tags: string[]}|{error: string}}
 */
const normalizeSpecialTags = (value) => {
    if (value === undefined || value === null || value === "") return { tags: [] };
    const list = Array.isArray(value) ? value : [value];
    const cleaned = [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
    const unknown = cleaned.filter((t) => !SPECIAL_TAGS.includes(t));
    if (unknown.length) {
        return { error: `Unknown special tag(s): ${unknown.join(", ")}. Allowed: ${SPECIAL_TAGS.join(", ")}.` };
    }
    return { tags: cleaned };
};

// Get all products (Public - anyone can access)
export const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json({
            success: true,
            count: products.length,
            products,
        });
    } catch (error) {
        console.error("Get Products Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching products",
            error: error.message,
        });
    }
};

// Get single product by ID (Public).
//
// This endpoint is the legacy entry point. New URLs use slugs, but old
// links using `/product/:id` still hit here. We return the product plus
// `redirectTo` — the canonical slug URL — so the client can swap the
// browser URL with `navigate(..., { replace: true })`.
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const redirectTo = product.slug && product.categorySlug
            ? `/product/${product.categorySlug}/${product.slug}`
            : null;

        res.status(200).json({
            success: true,
            product,
            redirectTo,
        });
    } catch (error) {
        console.error("Get Product By ID Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching product",
            error: error.message,
        });
    }
};

// Get single product by slug (Public).
//
// Canonical lookup. `categorySlug` is validated against the product's
// own categorySlug — if a user lands on a stale category URL after a
// product has been recategorized, we 200 with `redirectTo` set to the
// correct path instead of forcing a 404.
export const getProductBySlug = async (req, res) => {
    try {
        const { categorySlug, productSlug } = req.params;

        const product = await Product.findOne({ slug: productSlug });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        const redirectTo = product.categorySlug !== categorySlug
            ? `/product/${product.categorySlug}/${product.slug}`
            : null;

        res.status(200).json({
            success: true,
            product,
            redirectTo,
        });
    } catch (error) {
        console.error("Get Product By Slug Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching product",
            error: error.message,
        });
    }
};

/**
 * Resolve a URL segment to a canonical gender or category value.
 *
 * Both are closed sets now, so this is an exact match against the taxonomy
 * rather than the case-insensitive regex the free-form design required. That
 * also removes the regex-injection surface: the segment is never compiled into
 * a RegExp, it is only ever looked up.
 *
 * Case-tolerant so existing lower-cased links keep working, but it always
 * returns the canonical spelling.
 */
const canonical = (values, segment) => {
    const needle = String(segment || "").trim().toLowerCase();
    return values.find((v) => v.toLowerCase() === needle) || null;
};

/**
 * Build the product filter for a browse request.
 *
 * URL shapes, all of which predate this change except the gender one:
 *   /category/Lehengas          → that category
 *   /category/Women             → every Women's product (the cross-cutting
 *                                 query the flat design could not answer)
 *   /category/Kids/Boys         → gender + category. Existing Kids links keep
 *                                 working unchanged: what used to be
 *                                 category=Kids + subCategory=Boys is now
 *                                 gender=Kids + category=Boys, which is the
 *                                 same two segments in the same order.
 *   ?gender=Women               → narrows any of the above
 *
 * @returns {{filter: object}|{error: string}}
 */
const buildBrowseFilter = (segment, subSegment, queryGender) => {
    const filter = {};

    const genderFromQuery = queryGender ? canonical(GENDERS, queryGender) : null;
    if (queryGender && !genderFromQuery) {
        return { error: `Unknown gender "${queryGender}".` };
    }
    if (genderFromQuery) filter.gender = genderFromQuery;

    const genderSegment = canonical(GENDERS, segment);
    const categorySegment = canonical(ALL_CATEGORIES, segment);

    if (subSegment) {
        /* Two segments: gender then category. */
        if (!genderSegment) return { error: `Unknown gender "${segment}".` };
        const category = canonical(CATEGORIES_BY_GENDER[genderSegment], subSegment);
        if (!category) {
            return { error: `"${subSegment}" is not a category under ${genderSegment}.` };
        }
        filter.gender = genderSegment;
        filter.category = category;
        return { filter };
    }

    if (genderSegment) {
        filter.gender = genderSegment;
        return { filter };
    }
    if (categorySegment) {
        filter.category = categorySegment;
        return { filter };
    }

    return { error: `"${segment}" is not a known gender or category.` };
};

// Get products by gender and/or category (Public - anyone can access).
export const getProductsByCategory = async (req, res) => {
    try {
        const { categoryName } = req.params;
        const subSegment = req.params.subCategory || req.query.subCategory;

        const { filter, error } = buildBrowseFilter(
            categoryName,
            subSegment,
            req.query.gender
        );

        if (error) {
            /* An unknown segment is an empty result, not a server error — a
               stale bookmark should render an empty category page, not a 500. */
            return res.status(200).json({ success: true, count: 0, products: [], message: error });
        }

        const products = await Product.find(filter);

        res.status(200).json({
            success: true,
            count: products.length,
            products,
        });
    } catch (error) {
        console.error("Get Products By Category Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching products by category",
            error: error.message,
        });
    }
};

// Get products by special tag (Public - anyone can access)
export const getProductsBySpecialTag = async (req, res) => {
    try {
        const { tag } = req.params;

        /* Special tags are a closed set, so this is an exact lookup against
           the array field rather than a regex over the old single-value one. */
        const canonicalTag = SPECIAL_TAGS.find(
            (t) => t.toLowerCase() === String(tag || "").trim().toLowerCase()
        );

        if (!canonicalTag) {
            return res.status(200).json({
                success: true,
                count: 0,
                products: [],
                message: `"${tag}" is not a special tag.`,
            });
        }

        /* Matching a scalar against an array field matches any element. */
        const products = await Product.find({ specialTags: canonicalTag });

        res.status(200).json({
            success: true,
            count: products.length,
            products,
        });
    } catch (error) {
        console.error("Get Products By Special Tag Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching products by special tag",
            error: error.message,
        });
    }
};

// Create product (Admin only)
export const createProduct = async (req, res) => {
    try {
        const {
            name, description, shortDescription, price,
            gender, category, images, colors, variants, specialTags, weight, isCategoryCover,
        } = req.body;

        if (!name || !description || !price || !gender || !category || !weight) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, description, price, gender, category, and weight",
            });
        }

        /* Category is nested under gender, so the pair is validated together.
           The schema enforces this too — this check exists to return a clear
           400 rather than a ValidationError. */
        const invalid = validateGenderCategory(gender, category);
        if (invalid) {
            return res.status(400).json({ success: false, message: invalid });
        }

        const tagResult = normalizeSpecialTags(specialTags);
        if (tagResult.error) {
            return res.status(400).json({ success: false, message: tagResult.error });
        }

        // Validate variant matrix
        const result = validateVariants(variants, colors);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }
        const cleanVariants = result.variants;

        const categoryCover = isCategoryCover === true || isCategoryCover === "true";

        /* Auto-unset previous cover. Scoped to gender + category, since the
           same category name no longer identifies a listing on its own. */
        if (categoryCover) {
            await Product.updateMany(
                { gender, category, isCategoryCover: true },
                { $set: { isCategoryCover: false } }
            );
        }

        const product = new Product({
            name,
            shortDescription: shortDescription || "",
            description,
            price,
            gender,
            category,
            images: images || [],
            colors: colors || [],
            variants: cleanVariants,
            weight,
            specialTags: tagResult.tags,
            isCategoryCover: categoryCover,
        });

        await product.save();

        res.status(201).json({
            success: true,
            message: "Product created successfully",
            product,
        });
    } catch (error) {
        console.error("Create Product Error:", error);
        if (error.name === "ValidationError") {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({
            success: false,
            message: "Server error creating product",
            error: error.message,
        });
    }
};

// Update product (Admin only)
//
// Implementation note: uses findById + .save() rather than
// findByIdAndUpdate. findByIdAndUpdate has historically unreliable
// behaviour when replacing arrays of subdocuments; .save() gives us
// full middleware + a clean, well-defined array replacement.
export const updateProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        const wantsCover = req.body.isCategoryCover === true || req.body.isCategoryCover === "true";

        // If marking as category cover, unset any other cover in that
        // gender + category first — the category name alone no longer
        // identifies a listing.
        if (wantsCover) {
            const targetGender = req.body.gender || product.gender;
            const targetCategory = req.body.category || product.category;
            if (targetGender && targetCategory) {
                await Product.updateMany(
                    {
                        gender: targetGender,
                        category: targetCategory,
                        isCategoryCover: true,
                        _id: { $ne: product._id },
                    },
                    { $set: { isCategoryCover: false } }
                );
            }
        }

        // Validate variants if the client sent them. If the client also sent
        // colors, validate against the new color list; otherwise re-use the
        // existing one so single-field updates don't trip the "color has no
        // matching images" check.
        if (req.body.variants !== undefined) {
            const colorList = req.body.colors !== undefined ? req.body.colors : product.colors;
            const result = validateVariants(req.body.variants, colorList);
            if (!result.ok) {
                return res.status(400).json({ success: false, message: result.message });
            }
            product.variants = result.variants;
            // totalStock is a virtual derived from variants — no manual set needed.
        }

        // Apply scalar + simple array fields. Using Object.assign would clobber
        // mongoose internals; assign explicitly to known paths instead.
        const assignable = [
            "name", "shortDescription", "description", "price",
            "gender", "category", "weight", "images", "colors",
        ];
        for (const key of assignable) {
            if (req.body[key] !== undefined) product[key] = req.body[key];
        }
        product.isCategoryCover = wantsCover;

        if (req.body.specialTags !== undefined) {
            const tagResult = normalizeSpecialTags(req.body.specialTags);
            if (tagResult.error) {
                return res.status(400).json({ success: false, message: tagResult.error });
            }
            product.specialTags = tagResult.tags;
        }

        /* Validate the pair after assignment, so changing either field alone is
           still checked against the other's current value. Clearing the
           reclassification flag is implicit: a product that now has a valid
           pair is, by definition, classified. */
        const invalid = validateGenderCategory(product.gender, product.category);
        if (invalid) {
            return res.status(400).json({ success: false, message: invalid });
        }
        product.needsReclassification = false;

        await product.save();

        // Re-read so the response reflects the persisted state, not in-memory.
        const fresh = await Product.findById(product._id);

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: fresh,
        });
    } catch (error) {
        console.error("Update Product Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error updating product",
            error: error.message,
        });
    }
};

// Delete product (Admin only)
export const deleteProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Product deleted successfully",
        });
    } catch (error) {
        console.error("Delete Product Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error deleting product",
            error: error.message,
        });
    }
};

// Bulk delete products (Admin only)
export const bulkDeleteProducts = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Please provide an array of product IDs.",
            });
        }

        const result = await Product.deleteMany({ _id: { $in: productIds } });

        res.status(200).json({
            success: true,
            message: `${result.deletedCount} product(s) deleted successfully.`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error("Bulk Delete Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error deleting products",
            error: error.message,
        });
    }
};

// Search products (Public - anyone can access)
export const searchProducts = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim() === "") {
            return res.status(400).json({
                success: false,
                message: "Search query is required",
            });
        }

        /* Escaped: this is the one place a raw query string still has to become
           a RegExp, because free-text search needs substring matching. */
        const regex = new RegExp(escapeRegex(q.trim()), "i");

        const products = await Product.find({
            $or: [
                { name: regex },
                { category: regex },
                { gender: regex },
                { description: regex },
                { shortDescription: regex },
            ],
        });

        res.status(200).json({
            success: true,
            count: products.length,
            products,
        });
    } catch (error) {
        console.error("Search Products Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error searching products",
            error: error.message,
        });
    }
};

// Get category cover images (Public)
export const getCategoryCovers = async (req, res) => {
    try {
        // Aggregation: for each category, pick the newest product with isCategoryCover=true.
        // If none exists, fall back to the first product in that category.
        const covers = await Product.aggregate([
            /* Products awaiting manual classification have no category and
               must not form a null bucket. */
            { $match: { category: { $exists: true, $ne: null } } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$category",
                    // Collect the newest cover product (if any)
                    coverProduct: {
                        $first: {
                            $cond: [
                                { $eq: ["$isCategoryCover", true] },
                                { image: { $arrayElemAt: ["$images.url", 0] }, productId: "$_id" },
                                "$$REMOVE",
                            ],
                        },
                    },
                    // Always keep the newest product as fallback
                    fallbackProduct: {
                        $first: {
                            image: { $arrayElemAt: ["$images.url", 0] },
                            productId: "$_id",
                        },
                    },
                },
            },
        ]);

        // For categories where coverProduct may contain REMOVE (no cover),
        // we need a second pass: find actual cover products per category
        const coverProducts = await Product.aggregate([
            { $match: { isCategoryCover: true, category: { $exists: true, $ne: null } } },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: "$category",
                    image: { $first: { $arrayElemAt: ["$images.url", 0] } },
                    productId: { $first: "$_id" },
                },
            },
        ]);

        // Build a map of cover products by category
        const coverMap = {};
        coverProducts.forEach((c) => {
            coverMap[c._id] = { image: c.image, productId: c.productId };
        });

        // Build fallback map from the first aggregation
        const fallbackMap = {};
        covers.forEach((c) => {
            fallbackMap[c._id] = c.fallbackProduct;
        });

        // Merge: prefer cover, fall back to newest product
        const result = {};
        const allCategories = new Set([...Object.keys(coverMap), ...Object.keys(fallbackMap)]);
        allCategories.forEach((cat) => {
            result[cat] = coverMap[cat] || fallbackMap[cat] || null;
        });

        res.status(200).json({
            success: true,
            covers: result,
        });
    } catch (error) {
        console.error("Get Category Covers Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching category covers",
            error: error.message,
        });
    }
};
