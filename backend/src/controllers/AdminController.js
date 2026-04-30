import Product from "../models/Products.js";
import { validateVariants } from "../utils/variants.js";

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

        if (!name || !description || !price || !category || !weight) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, description, price, category, and weight",
            });
        }

        // Parse variants + colors (sent as JSON strings from FormData)
        let variants = [];
        let colors = [];
        try {
            if (req.body.variants) variants = JSON.parse(req.body.variants);
            if (req.body.colors) colors = JSON.parse(req.body.colors);
        } catch {
            return res.status(400).json({ success: false, message: "Invalid variants/colors format." });
        }

        const result = validateVariants(variants, colors);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message });
        }
        const cleanVariants = result.variants;

        const categoryCover = isCategoryCover === "true" || isCategoryCover === true;

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

        const product = new Product({
            name,
            description,
            price: Number(price),
            category,
            images,
            colors,
            variants: cleanVariants,
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
        res.status(500).json({
            success: false,
            message: "Server error creating product",
            error: error.message,
            details: error.errors || error,
        });
    }
};
