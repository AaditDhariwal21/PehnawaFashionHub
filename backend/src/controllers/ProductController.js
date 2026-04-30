import Product from "../models/Products.js";
import { validateVariants } from "../utils/variants.js";

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

// Get single product by ID (Public - anyone can access)
export const getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found",
            });
        }

        res.status(200).json({
            success: true,
            product,
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

// Get products by category (Public - anyone can access)
export const getProductsByCategory = async (req, res) => {
    try {
        const { categoryName } = req.params;

        // Case-insensitive match
        const products = await Product.find({
            category: { $regex: new RegExp(`^${categoryName}$`, 'i') },
        });

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

        // Case-insensitive match
        const products = await Product.find({
            specialTag: { $regex: new RegExp(`^${tag}$`, 'i') },
        });

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
            category, images, colors, variants, specialTag, weight, isCategoryCover,
        } = req.body;

        if (!name || !description || !price || !category || !weight) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, description, price, category, and weight",
            });
        }

        // Validate variant matrix
        const result = validateVariants(variants, colors);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }
        const cleanVariants = result.variants;

        const categoryCover = isCategoryCover === true || isCategoryCover === "true";

        // Auto-unset previous cover in the same category
        if (categoryCover) {
            await Product.updateMany(
                { category, isCategoryCover: true },
                { $set: { isCategoryCover: false } }
            );
        }

        const product = new Product({
            name,
            shortDescription: shortDescription || "",
            description,
            price,
            category,
            images: images || [],
            colors: colors || [],
            variants: cleanVariants,
            weight,
            specialTag: specialTag || null,
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

        // If marking as category cover, unset any other cover in that category first.
        if (wantsCover) {
            const targetCategory = req.body.category || product.category;
            if (targetCategory) {
                await Product.updateMany(
                    { category: targetCategory, isCategoryCover: true, _id: { $ne: product._id } },
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
            "category", "weight", "specialTag", "images", "colors",
        ];
        for (const key of assignable) {
            if (req.body[key] !== undefined) product[key] = req.body[key];
        }
        product.isCategoryCover = wantsCover;

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

        const regex = new RegExp(q.trim(), "i");

        const products = await Product.find({
            $or: [
                { name: regex },
                { category: regex },
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
            { $match: { isCategoryCover: true } },
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
