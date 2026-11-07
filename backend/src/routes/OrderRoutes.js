import express from "express";
import {
    getMyOrders,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    getLatestPaidOrder,
} from "../controllers/OrderController.js";
import { confirmPayment } from "../controllers/paymentController.js";
import { viewGuestOrder, lookupGuestOrder, claimGuestOrder } from "../controllers/GuestOrderController.js";
import { verifyToken, isAdmin, blockAdminOrders } from "../middlewares/AuthMiddleware.js";
import { resolveGuestToken } from "../middlewares/GuestCheckoutMiddleware.js";
import {
    confirmLimiter,
    guestOrderViewLimiter,
    guestLookupIpLimiter,
    guestLookupEmailLimiter,
    guestClaimLimiter,
} from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

/* There is no POST /api/orders. Orders are created only after Square confirms
   payment, via the confirm routes below, the payment webhooks and the
   pending-order sweeper — all through finalizePendingOrder().

   Both aliases carry blockAdminOrders for the same reason paymentRoutes does:
   they are order-creation endpoints, and the frontend's disabled button is not
   a control. Missing it on one alias would leave the block trivially bypassable
   by posting to the other. */

// POST   /api/orders/confirm-square-payment  → Verify Square payment & create order
router.post("/confirm-square-payment", confirmLimiter, verifyToken, blockAdminOrders, confirmPayment);

// POST   /api/orders/verify-square-payment   → Alias
router.post("/verify-square-payment", confirmLimiter, verifyToken, blockAdminOrders, confirmPayment);

/* ── Guest orders ──
   Identified by the private token in the request BODY (never the URL), and
   always answered with the whitelisted guest view of the order. Declared
   before "/:id" so they can't be shadowed by it.

   These stay reachable when the guest-checkout flag is off: turning the
   feature off must not cut guests off from orders they already placed. */

// POST   /api/orders/guest/confirm  → Verify Square payment & create a guest's order
router.post("/guest/confirm", confirmLimiter, resolveGuestToken, confirmPayment);

// POST   /api/orders/guest/view     → A guest's order, by private link
router.post("/guest/view", guestOrderViewLimiter, resolveGuestToken, viewGuestOrder);

// POST   /api/orders/guest/lookup   → A guest's order, by order number + email (reduced view)
router.post("/guest/lookup", guestLookupIpLimiter, guestLookupEmailLimiter, lookupGuestOrder);

// POST   /api/orders/guest/claim    → Attach a guest order to the signed-in account
router.post("/guest/claim", guestClaimLimiter, verifyToken, blockAdminOrders, resolveGuestToken, claimGuestOrder);

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
