import express from "express";
import { getMe, updateAddress } from "../controllers/UserController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// GET /api/users/me - Fetch authenticated user's profile
router.get("/me", verifyToken, getMe);

// PUT /api/users/address - Update authenticated user's address
router.put("/address", verifyToken, updateAddress);

export default router;
