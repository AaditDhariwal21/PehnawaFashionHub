import Product from "../models/Products.js";

// Admin Dashboard Controller
export const getAdminDashboard = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            message: "Welcome to Admin Dashboard",
            user: req.user,
        });
    } catch (error) {
        console.error("Admin Dashboard Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message,
        });
    }
};

// Create New Product (Admin only)
export const createNewProduct = async (req, res) => {
    try {
        const { name, description, price, category, specialTag, weight, isCategoryCover } = req.body;

        // Validate required fields
        if (!name || !description || !price || !category || !weight) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, description, price, category, and weight",
            });
        }

        // Parse sizes (sent as JSON string from FormData)
        let sizes = [];
        if (req.body.sizes) {
            try {
                sizes = JSON.parse(req.body.sizes);
            } catch {
                return res.status(400).json({ success: false, message: "Invalid sizes format." });
            }
        }

        // Validate sizes: no duplicates, no negative stock
        const sizeNames = sizes.map((s) => s.size);
        if (new Set(sizeNames).size !== sizeNames.length) {
            return res.status(400).json({ success: false, message: "Duplicate sizes are not allowed." });
        }
        if (sizes.some((s) => s.stock < 0)) {
            return res.status(400).json({ success: false, message: "Stock cannot be negative." });
        }

        const totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

        const categoryCover = isCategoryCover === "true" || isCategoryCover === true;

        // If marking as cover, unset any existing cover in the same category
        if (categoryCover) {
            await Product.updateMany(
                { category, isCategoryCover: true },
                { $set: { isCategoryCover: false } }
            );
        }

        // Process uploaded images from Cloudinary
        const images = req.files
            ? req.files.map((file) => ({
                url: file.path,
                publicId: file.filename,
            }))
            : [];

        // Create the product
        const product = new Product({
            name,
            description,
            price: Number(price),
            category,
            images,
            sizes,
            totalStock,
            weight: Number(weight),
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
        console.error("Error details:", JSON.stringify(error, null, 2));
        res.status(500).json({
            success: false,
            message: "Server error creating product",
            error: error.message,
            details: error.errors || error,
        });
    }
};
