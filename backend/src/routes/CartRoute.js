import express from "express";
import {
    getCart,
    addCartItem,
    setCartItemQuantity,
    removeCartItem,
    clearCart,
    mergeCart,
} from "../controllers/CartController.js";
import { verifyToken } from "../middlewares/AuthMiddleware.js";
import { cartLimiter } from "../middlewares/RateLimitMiddleware.js";

const router = express.Router();

/* Signed-in customers only. Guests keep their cart in localStorage. */
router.use(cartLimiter, verifyToken);

// GET    /api/cart        → The saved cart, hydrated with current prices
router.get("/", getCart);

// DELETE /api/cart        → Empty the cart
router.delete("/", clearCart);

// POST   /api/cart/items  → Add a line (or add to its quantity)
router.post("/items", addCartItem);

// PUT    /api/cart/items  → Set a line's quantity
router.put("/items", setCartItemQuantity);

// DELETE /api/cart/items  → Remove a line
router.delete("/items", removeCartItem);

// POST   /api/cart/merge  → Merge the signed-out cart in at sign-in
router.post("/merge", mergeCart);

export default router;
