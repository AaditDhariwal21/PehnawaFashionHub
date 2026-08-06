import express from "express";
import {
    getMyOrders,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    getLatestPaidOrder,
} from "../controllers/OrderController.js";
import { confirmPayment } from "../controllers/paymentController.js";
import { verifyToken, isAdmin, blockAdminOrders } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

/* There is no POST /api/orders. Orders are created only after Square confirms
   payment, via the two routes below and the payment.updated webhook.

   Both aliases carry blockAdminOrders for the same reason paymentRoutes does:
   they are order-creation endpoints, and the frontend's disabled button is not
   a control. Missing it on one alias would leave the block trivially bypassable
   by posting to the other. */

// POST   /api/orders/confirm-square-payment  → Verify Square payment & create order
router.post("/confirm-square-payment", verifyToken, blockAdminOrders, confirmPayment);

// POST   /api/orders/verify-square-payment   → Alias
router.post("/verify-square-payment", verifyToken, blockAdminOrders, confirmPayment);

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
