import express from "express";
import { getAdminDashboard, createNewProduct } from "../controllers/AdminController.js";
import {
    getPromoCodes,
    createPromoCode,
    updatePromoCode,
    setPromoCodeActive,
    getPromoRedemptions,
} from "../controllers/PromoController.js";
import { verifyToken, isAdmin } from "../middlewares/AuthMiddleware.js";
import upload from "../middlewares/UploadMiddleware.js";

const router = express.Router();

// GET /api/adminDashboard - Admin only route
router.get("/", verifyToken, isAdmin, getAdminDashboard);

// POST /api/adminDashboard/newProduct - Create product with image uploads (Admin only)
router.post("/newProduct", verifyToken, isAdmin, upload.array("images", 10), createNewProduct);

/* ── Promo codes (Admin only) ── */

// GET    /api/adminDashboard/promocodes                  → List all codes
router.get("/promocodes", verifyToken, isAdmin, getPromoCodes);

// POST   /api/adminDashboard/promocodes                  → Create a code
router.post("/promocodes", verifyToken, isAdmin, createPromoCode);

// PUT    /api/adminDashboard/promocodes/:id              → Edit a code
router.put("/promocodes/:id", verifyToken, isAdmin, updatePromoCode);

// PATCH  /api/adminDashboard/promocodes/:id/active       → Kill-switch on/off
router.patch("/promocodes/:id/active", verifyToken, isAdmin, setPromoCodeActive);

// GET    /api/adminDashboard/promocodes/:id/redemptions  → Audit trail
router.get("/promocodes/:id/redemptions", verifyToken, isAdmin, getPromoRedemptions);

export default router;
