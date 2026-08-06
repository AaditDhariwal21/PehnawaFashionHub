import express from "express";
import { createCheckoutSession, confirmPayment } from "../controllers/paymentController.js";
import { verifyToken, blockAdminOrders } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

/* blockAdminOrders is the real enforcement of "admins cannot place orders" —
   the disabled button on the checkout page is UX only. create-checkout is the
   sole way a PendingOrder comes into existence, so blocking it there is what
   makes the guarantee complete; confirm is covered too, so a PendingOrder
   created before an account was promoted to admin still cannot be turned into
   an order. */

// POST /api/payments/create-checkout → Create Square checkout session
router.post("/create-checkout", verifyToken, blockAdminOrders, createCheckoutSession);

// POST /api/payments/confirm → Confirm payment & create order
router.post("/confirm", verifyToken, blockAdminOrders, confirmPayment);

export default router;
