/* Must be the first import. ES modules evaluate every import before this
   file's own body runs, so the previous `dotenv.config()` call here executed
   only AFTER squareClient, the Shippo client and the other modules had already
   read process.env at load time — locally they all saw undefined. (Production
   was unaffected: Render provides real environment variables, not a .env.) */
import "dotenv/config";

import express from "express";
import mongoose from "mongoose";
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
import cartRoutes from "./routes/CartRoute.js";
import configRoutes from "./routes/ConfigRoute.js";
import { runIndexMigrations } from "./config/indexMigrations.js";
import { startPendingOrderSweeper } from "./services/pendingOrderSweeper.js";

const app = express();

/* ---------------- Proxy ---------------- */

/* Render puts proxies in front of the app, so the connecting address is the
   proxy's, and the client's is in X-Forwarded-For. Trusting exactly the number
   of hops Render adds makes req.ip the real client address — which the rate
   limiters key on. Too low and every visitor shares one rate-limit bucket; too
   high and a client can spoof its own address. Render does not document the
   number; verify it after deploy with DEBUG_CLIENT_IP (below). */
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10);
app.set("trust proxy", Number.isInteger(trustProxyHops) && trustProxyHops >= 0 ? trustProxyHops : 1);

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
app.use("/api/cart", cartRoutes);
app.use("/api/config", configRoutes);

/* Temporary deploy check for TRUST_PROXY_HOPS. Off unless DEBUG_CLIENT_IP is
   "true". Open it from your own browser: `ip` should be your public IP
   address. Then remove the variable. */
if (process.env.DEBUG_CLIENT_IP === "true") {
    app.get("/api/debug/client-ip", (req, res) => {
        const forwarded = String(req.headers["x-forwarded-for"] || "");
        res.json({
            ip: req.ip,
            trustProxyHops: app.get("trust proxy"),
            forwardedHopCount: forwarded ? forwarded.split(",").length : 0,
        });
    });
}

/* ---------------- Global Error Handler ---------------- */

app.use((err, req, res, next) => {
    console.error("Global Error Handler:", err);

    /* Never echo internal error text to the client: it can expose stack
       details, query shapes and library internals. Client errors raised by
       middleware (malformed JSON, oversized body, CORS) keep a generic
       message for their status. */
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
        success: false,
        message: status < 500 ? "Invalid request." : "Internal Server Error",
    });
});

/* ---------------- Start Server ---------------- */

const PORT = process.env.PORT || 5000;

let server = null;
let sweeperTimer = null;
let shuttingDown = false;

/**
 * Stop cleanly on Ctrl+C (SIGINT), a platform stop (SIGTERM — Render sends it
 * on every deploy), Ctrl+Break (SIGBREAK, Windows) and the terminal window
 * being closed (SIGHUP, which Windows also raises). Stops accepting requests,
 * lets in-flight ones finish, closes the database connection and exits — so
 * the process can't linger in the background holding the port. Forced after
 * 5 seconds if something hangs.
 */
const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — shutting down…`);

    const force = setTimeout(() => {
        console.error("Shutdown timed out — forcing exit.");
        process.exit(1);
    }, 5000);
    force.unref();

    if (sweeperTimer) clearInterval(sweeperTimer);

    const closeServer = server
        ? new Promise((resolve) => {
            server.close(() => resolve());
            server.closeIdleConnections?.();
        })
        : Promise.resolve();

    closeServer
        .then(() => mongoose.connection.close())
        .catch((error) => console.error("Error during shutdown:", error?.message))
        .finally(() => process.exit(0));
};

for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"]) {
    process.on(signal, () => shutdown(signal));
}

const startServer = async () => {
    try {
        await connectDB();
        await runIndexMigrations();
        sweeperTimer = startPendingOrderSweeper();

        /* Express 5 calls this back on failure too (with the error), so only
           announce success when there isn't one; failures are reported by the
           "error" handler below. */
        server = app.listen(PORT, (error) => {
            if (error) return;
            console.log(`Server running on port ${PORT}`);
        });

        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(
                    `\nPort ${PORT} is already in use — another backend is probably still running ` +
                    `(e.g. from a terminal that was closed instead of stopped with Ctrl+C).\n` +
                    `Find it with:  netstat -ano | findstr :${PORT}   then stop it with:  taskkill /PID <pid> /T /F\n`
                );
            } else {
                console.error("Server error:", error);
            }
            process.exit(1);
        });
    } catch (error) {
        console.error("Server failed to start:", error);
        process.exit(1);
    }
};

startServer();