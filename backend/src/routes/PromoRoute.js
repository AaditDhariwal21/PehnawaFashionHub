import express from "express";
import { validatePromoCode } from "../controllers/PromoController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";

const router = express.Router();

// POST /api/promo/validate → Check a code against the cart and return the
//                            computed discount. Advisory: takes no usage slot.
//                            Requires auth because per-user limits and
//                            first-order-only eligibility are per-customer.
router.post("/validate", verifyToken, validatePromoCode);

export default router;
