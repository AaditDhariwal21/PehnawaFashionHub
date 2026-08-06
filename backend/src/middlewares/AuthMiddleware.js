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

/**
 * Refuse order placement by admin accounts.
 *
 * The checkout page disables its Pay Now button for admins, but that is a
 * courtesy to the person clicking, not a control: a disabled button is a DOM
 * attribute, and the endpoints behind it are reachable with a token and curl.
 * This is the actual enforcement, and it deliberately does not consult anything
 * the client sent — only the role inside the signed JWT.
 *
 * Applied to the checkout-creation and payment-confirmation routes rather than
 * to browsing or cart routes: admins are meant to be able to shop the site and
 * reach checkout to inspect it, and are stopped only at the point of ordering.
 */
export const blockAdminOrders = (req, res, next) => {
    if (req.user?.role === "admin") {
        return res.status(403).json({
            success: false,
            code: "ADMIN_CANNOT_ORDER",
            message: "Admin accounts cannot place orders. Please use a customer account to check out.",
        });
    }
    next();
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
