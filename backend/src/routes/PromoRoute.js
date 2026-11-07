import express from "express";
import { validatePromoCode, validateGuestPromoCode } from "../controllers/PromoController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { promoValidateLimiter } from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

// POST /api/promo/validate → Check a code against the cart and return the
//                            computed discount. Advisory: takes no usage slot.
//                            Requires auth because per-user limits and
//                            first-order-only eligibility are per-customer.
router.post("/validate", promoValidateLimiter, verifyToken, validatePromoCode);

// POST /api/promo/guest/validate → The same for a guest, without the
//                                  per-customer rules (enforced at checkout,
//                                  against the checkout email).
router.post("/guest/validate", promoValidateLimiter, validateGuestPromoCode);

export default router;
