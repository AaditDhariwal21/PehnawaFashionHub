import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js";
import authRoutes from "./routes/AuthRoute.js";
import adminRoutes from "./routes/AdminRoute.js";
import productRoutes from "./routes/ProductRoute.js";
import uploadRoutes from "./routes/UploadRoute.js";
import orderRoutes from "./routes/OrderRoutes.js";
import shippingRoutes from "./routes/shippingRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";

connectDB();

const app = express();

app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        "http://localhost:5173"
    ],
    credentials: true
}));
app.use(cookieParser());

// Webhook route MUST come before express.json() — needs raw body for signature verification
app.use("/api/webhooks/square", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/adminDashboard", adminRoutes);
app.use("/api/adminDashboard/upload", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/payments", paymentRoutes);

// Global error handler for multer/cloudinary errors
app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error",
        error: err.toString(),
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
