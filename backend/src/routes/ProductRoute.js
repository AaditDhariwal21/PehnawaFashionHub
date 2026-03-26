import express from "express";
import {
    getAllProducts,
    getProductById,
    getProductsByCategory,
    getProductsBySpecialTag,
    createProduct,
    updateProduct,
    deleteProduct,
    bulkDeleteProducts,
    searchProducts,
    getCategoryCovers,
} from "../controllers/ProductController.js";
import { verifyToken, isAdmin } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// Public routes (anyone can access)
router.get("/", getAllProducts);
router.get("/search", searchProducts);
router.get("/categories/covers", getCategoryCovers);
router.get("/category/:categoryName", getProductsByCategory);
router.get("/tag/:tag", getProductsBySpecialTag);
router.get("/:id", getProductById);

// Admin only routes (requires authentication + admin role)
router.post("/", verifyToken, isAdmin, createProduct);
router.delete("/bulk", verifyToken, isAdmin, bulkDeleteProducts);
router.put("/:id", verifyToken, isAdmin, updateProduct);
router.delete("/:id", verifyToken, isAdmin, deleteProduct);

export default router;
