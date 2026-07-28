import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import connectDB from "./config/db.js";

import authRoutes from "./routes/AuthRoute.js";
import adminRoutes from "./routes/AdminRoute.js";
import productRoutes from "./routes/ProductRoute.js";
import uploadRoutes from "./routes/UploadRoute.js";
import orderRoutes from "./routes/OrderRoutes.js";
import shippingRoutes from "./routes/shippingRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import userRoutes from "./routes/UserRoute.js";
import wishlistRoutes from "./routes/WishlistRoute.js";
import promoRoutes from "./routes/PromoRoute.js";

const app = express();

/* ---------------- Security + Logging ---------------- */

app.use(helmet());
app.use(morgan("dev"));

/* ---------------- CORS ---------------- */

// Explicit production origins.
const PROD_ORIGINS = [
    "https://pehnawafashionhub.vercel.app",
    "https://pehnawa-fashion-hub.vercel.app", // if exists
    "https://pehnawafashionhub.com",
    "https://www.pehnawafashionhub.com",
];

// Allow ANY localhost / 127.0.0.1 port so local dev always connects no matter
// which port Vite picks (5173, 5174, …). A browser cannot forge a localhost
// Origin header, so this stays safe in production.
const isLocalhostOrigin = (origin) =>
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

app.use(cors({
    origin(origin, callback) {
        // No Origin = non-browser client (curl, server-to-server, health checks)
        if (!origin || isLocalhostOrigin(origin) || PROD_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
}));

app.use(cookieParser());

/* ---------------- Webhook (must be before express.json) ---------------- */

app.use(
    "/api/webhooks/square",
    express.raw({ type: "application/json" }),
    webhookRoutes
);

/* ---------------- Body Parser ---------------- */

app.use(express.json());

/* ---------------- Routes ---------------- */

app.use("/api/auth", authRoutes);
app.use("/api/adminDashboard", adminRoutes);
app.use("/api/adminDashboard/upload", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/promo", promoRoutes);

/* ---------------- Global Error Handler ---------------- */

app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        error: err.toString(),
    });
});

/* ---------------- Start Server ---------------- */

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Server failed to start:", error);
        process.exit(1);
    }
};

startServer();