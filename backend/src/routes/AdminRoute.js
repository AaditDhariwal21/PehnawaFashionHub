import express from "express";
import { getAdminDashboard, createNewProduct } from "../controllers/AdminController.js";
import { verifyToken, isAdmin } from "../middlewares/AuthMiddleware.js";
import upload from "../middlewares/UploadMiddleware.js";

const router = express.Router();

// GET /api/adminDashboard - Admin only route
router.get("/", verifyToken, isAdmin, getAdminDashboard);

// POST /api/adminDashboard/newProduct - Create product with image uploads (Admin only)
router.post("/newProduct", verifyToken, isAdmin, upload.array("images", 10), createNewProduct);

export default router;
