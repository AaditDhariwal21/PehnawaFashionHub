import express from "express";
import { createCheckoutSession, confirmPayment } from "../controllers/paymentController.js";
import { verifyToken, blockAdminOrders } from "../middlewares/AuthMiddleware.js";
import {
    requireGuestCheckoutEnabled,
    prepareGuestCheckout,
} from "../middlewares/GuestCheckoutMiddleware.js";
import {
    checkoutLimiter,
    guestCheckoutEmailLimiter,
    confirmLimiter,
} from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

/* blockAdminOrders is the real enforcement of "admins cannot place orders" —
   the disabled button on the checkout page is UX only. create-checkout is the
   sole way a PendingOrder comes into existence, so blocking it there is what
   makes the guarantee complete; confirm is covered too, so a PendingOrder
   created before an account was promoted to admin still cannot be turned into
   an order. */

// POST /api/payments/create-checkout → Create Square checkout session
router.post("/create-checkout", checkoutLimiter, verifyToken, blockAdminOrders, createCheckoutSession);

// POST /api/payments/guest/create-checkout → Create Square checkout session without an account
//   Same handler: identical server-side pricing, stock, shipping and promo
//   checks. Gated by the GUEST_CHECKOUT_ENABLED flag.
router.post(
    "/guest/create-checkout",
    requireGuestCheckoutEnabled,
    checkoutLimiter,
    guestCheckoutEmailLimiter,
    prepareGuestCheckout,
    createCheckoutSession
);

// POST /api/payments/confirm → Confirm payment & create order
router.post("/confirm", confirmLimiter, verifyToken, blockAdminOrders, confirmPayment);

export default router;
