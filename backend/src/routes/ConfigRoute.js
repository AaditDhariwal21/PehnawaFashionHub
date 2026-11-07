import express from "express";
import { getPublicConfig } from "../controllers/ConfigController.js";

const router = express.Router();

// GET /api/config → Public storefront settings (e.g. whether guest checkout is on)
router.get("/", getPublicConfig);

export default router;
