import express from "express";
import { signup, login, updateProfile, logoutUser } from "../controllers/AuthController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { authIpLimiter, loginAttemptLimiter } from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

// POST /api/auth/signup - Register a new user
router.post("/signup", authIpLimiter, signup);

// POST /api/auth/login - Login existing user
router.post("/login", authIpLimiter, loginAttemptLimiter, login);

// POST /api/auth/logout - Clear httpOnly cookie
router.post("/logout", logoutUser);

// PUT /api/auth/profile - Update user profile (protected)
router.put("/profile", verifyToken, updateProfile);

export default router;
