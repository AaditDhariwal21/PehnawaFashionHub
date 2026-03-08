import jwt from "jsonwebtoken";
import User from "../models/Users.js";

// Middleware to verify JWT token and protect routes
export const verifyToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided.",
            });
        }

        // Extract token (remove "Bearer " prefix)
        const token = authHeader.split(" ")[1];

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach user info to request object
        req.user = decoded;

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token has expired. Please login again.",
            });
        }
        return res.status(401).json({
            success: false,
            message: "Invalid token.",
            error: error.message,
        });
    }
};

// Middleware to check if user is admin
export const isAdmin = async (req, res, next) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required.",
            });
        }
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error checking admin status.",
        });
    }
};

// Middleware to get full user data from database (optional, use when needed)
export const getFullUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }
        req.fullUser = user;
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching user data.",
        });
    }
};
