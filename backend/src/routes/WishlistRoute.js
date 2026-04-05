import express from "express";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
} from "../controllers/WishlistController.js";

const router = express.Router();

router.get("/", verifyToken, getWishlist);
router.post("/", verifyToken, addToWishlist);
router.delete("/:productId", verifyToken, removeFromWishlist);

export default router;
