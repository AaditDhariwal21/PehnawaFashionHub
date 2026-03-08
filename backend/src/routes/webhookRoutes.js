import express from "express";
import { handleSquareWebhook } from "../controllers/webhookController.js";

const router = express.Router();

// POST /api/webhooks/square → Handle Square webhook events
router.post("/", handleSquareWebhook);

export default router;
