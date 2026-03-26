import express from "express";
import { signup, login, updateProfile, googleLogin, logoutUser } from "../controllers/AuthController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// POST /api/auth/signup - Register a new user
router.post("/signup", signup);

// POST /api/auth/login - Login existing user
router.post("/login", login);

// POST /api/auth/google - Google Sign-In with ID token
router.post("/google", googleLogin);

// POST /api/auth/logout - Clear httpOnly cookie
router.post("/logout", logoutUser);

// PUT /api/auth/profile - Update user profile (protected)
router.put("/profile", verifyToken, updateProfile);

export default router;
