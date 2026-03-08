import express from "express";
import { calculateShippingRate } from "../controllers/shippingController.js";

const router = express.Router();

// POST /api/shipping/rates → Calculate live shipping rate
router.post("/rates", calculateShippingRate);

export default router;
