import express from "express";
import {
    createOrder,
    getMyOrders,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    getLatestPaidOrder,
} from "../controllers/OrderController.js";
import { confirmPayment } from "../controllers/paymentController.js";
import { verifyToken, isAdmin } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// POST   /api/orders                         → Create order  (any authenticated user)
router.post("/", verifyToken, createOrder);

// POST   /api/orders/confirm-square-payment  → Verify Square payment & create order
router.post("/confirm-square-payment", verifyToken, confirmPayment);

// POST   /api/orders/verify-square-payment   → Alias
router.post("/verify-square-payment", verifyToken, confirmPayment);

// GET    /api/orders/my            → User's own orders
router.get("/my", verifyToken, getMyOrders);

// GET    /api/orders/latest-paid   → User's most recent paid order (polling)
router.get("/latest-paid", verifyToken, getLatestPaidOrder);

// GET    /api/orders               → All orders (admin only)
router.get("/", verifyToken, isAdmin, getAllOrders);

// GET    /api/orders/:id      → Single order (admin or owner)
router.get("/:id", verifyToken, getOrderById);

// PUT    /api/orders/:id/status → Update status (admin only)
router.put("/:id/status", verifyToken, isAdmin, updateOrderStatus);

export default router;
