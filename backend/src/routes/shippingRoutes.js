import express from "express";
import { calculateShippingRate } from "../controllers/shippingController.js";
import { shippingRateLimiter } from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

// POST /api/shipping/rates → Calculate live shipping rate
//   Public (guests need it too) and every call is a paid Shippo request,
//   so it is rate limited.
router.post("/rates", shippingRateLimiter, calculateShippingRate);

export default router;
