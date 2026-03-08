import express from "express";
import { createCheckoutSession, confirmPayment } from "../controllers/paymentController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// POST /api/payments/create-checkout → Create Square checkout session
router.post("/create-checkout", verifyToken, createCheckoutSession);

// POST /api/payments/confirm → Confirm payment & create order
router.post("/confirm", verifyToken, confirmPayment);

export default router;
