import express from "express";
import { uploadImages } from "../controllers/UploadController.js";
import { verifyToken, isAdmin } from "../middlewares/AuthMiddleware.js";
import upload from "../middlewares/UploadMiddleware.js";

const router = express.Router();

// POST /api/adminDashboard/upload - Upload images (Admin only)
router.post("/", verifyToken, isAdmin, upload.array("images", 10), uploadImages);

export default router;
