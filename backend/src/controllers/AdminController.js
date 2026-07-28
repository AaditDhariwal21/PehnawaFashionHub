import Product from "../models/Products.js";
import { validateVariants } from "../utils/variants.js";
import {
    GENDERS,
    CATEGORIES_BY_GENDER,
    SPECIAL_TAGS,
    isValidCategoryForGender,
} from "../config/productTaxonomy.js";

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
        const { name, description, price, gender, category, weight, isCategoryCover } = req.body;

        if (!name || !description || !price || !gender || !category || !weight) {
            return res.status(400).json({
                success: false,
                message: "Please provide name, description, price, gender, category, and weight",
            });
        }

        /* Category is nested under gender. This path used to have weaker
           validation than ProductController.createProduct — it never handled
           subCategory at all — so the check is stated explicitly here rather
           than left to the schema, which would surface as a 500. */
        if (!GENDERS.includes(gender)) {
            return res.status(400).json({
                success: false,
                message: `Gender must be one of: ${GENDERS.join(", ")}.`,
            });
        }
        if (!isValidCategoryForGender(gender, category)) {
            return res.status(400).json({
                success: false,
                message: `"${category}" is not a valid category for ${gender}. Allowed: ${CATEGORIES_BY_GENDER[gender].join(", ")}.`,
            });
        }

        /* Multipart/FormData sends repeated keys as an array and a single value
           as a string. */
        const rawTags = req.body.specialTags;
        const tagList = rawTags === undefined || rawTags === ""
            ? []
            : (Array.isArray(rawTags) ? rawTags : [rawTags]);
        const specialTags = [...new Set(tagList.map((t) => String(t).trim()).filter(Boolean))];
        const unknownTags = specialTags.filter((t) => !SPECIAL_TAGS.includes(t));
        if (unknownTags.length) {
            return res.status(400).json({
                success: false,
                message: `Unknown special tag(s): ${unknownTags.join(", ")}. Allowed: ${SPECIAL_TAGS.join(", ")}.`,
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
                { gender, category, isCategoryCover: true },
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
            gender,
            category,
            images,
            colors,
            variants: cleanVariants,
            weight: Number(weight),
            specialTags,
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
