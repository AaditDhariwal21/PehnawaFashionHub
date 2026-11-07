import Cart from "../models/Cart.js";
import Product from "../models/Products.js";
import { findVariant, variantImage } from "../utils/variants.js";
import { validateCartLine, CHECKOUT_LIMITS } from "../utils/checkoutValidation.js";

/**
 * A signed-in customer's saved cart (guests keep theirs in localStorage).
 *
 * Every endpoint answers with the whole, freshly hydrated cart, in the same
 * item shape the storefront already uses for its local cart:
 *   { productId, name, price, image, color, size, quantity, stock }
 * Price, name, image and stock come from the product at read time, never from
 * the client and never from what was stored.
 */

const MAX_SAVE_ATTEMPTS = 3;

const sameLine = (a, b) =>
    a.productId.toString() === b.productId.toString()
    && (a.color || "") === (b.color || "")
    && (a.size || "") === (b.size || "");

/**
 * Load → change → save, with optimistic concurrency. A concurrent edit from
 * another tab or device makes save() throw VersionError, and the change is
 * re-applied to a fresh read instead of overwriting the other edit. A cart
 * created concurrently by two requests collides on the unique user index and
 * is handled the same way.
 *
 * `mutate(cart)` changes cart.items in place, or returns { error } to abort.
 */
const mutateCart = async (userId, mutate) => {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
        const cart = (await Cart.findOne({ user: userId })) || new Cart({ user: userId, items: [] });

        const outcome = await mutate(cart);
        if (outcome?.error) return outcome;

        try {
            await cart.save();
            return { cart };
        } catch (error) {
            if (error?.name === "VersionError" || error?.code === 11000) continue;
            throw error;
        }
    }
    throw new Error("Cart update conflict — please retry.");
};

/**
 * Turn stored lines into display items. Lines whose product or variant no
 * longer exists are dropped from the response and pruned from the cart.
 */
const hydrateCart = async (cart) => {
    if (!cart || cart.items.length === 0) return [];

    const ids = [...new Set(cart.items.map((i) => i.productId.toString()))];
    const products = await Product.find({ _id: { $in: ids } })
        .select("name images colors variants")
        .lean();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    const items = [];
    let hasStale = false;

    for (const line of cart.items) {
        const product = byId.get(line.productId.toString());
        const variant = product ? findVariant(product, line.color, line.size) : null;
        if (!variant) {
            hasStale = true;
            continue;
        }
        items.push({
            productId: product._id.toString(),
            name: product.name,
            price: variant.price,
            image: variantImage(product, line.color),
            color: line.color || "",
            size: line.size || "",
            quantity: line.quantity,
            stock: variant.stock,
        });
    }

    if (hasStale) {
        const keep = new Set(items.map((i) => `${i.productId}|${i.color}|${i.size}`));
        await mutateCart(cart.user, (fresh) => {
            fresh.items = fresh.items.filter((l) => keep.has(`${l.productId}|${l.color || ""}|${l.size || ""}`));
        }).catch((error) => console.error("hydrateCart prune error:", error?.message));
    }

    return items;
};

/** Refuses a line whose product/variant doesn't exist, so nothing unbuyable is saved. */
const assertBuyable = async (line) => {
    const product = await Product.findById(line.productId).select("variants").lean();
    return !!(product && findVariant(product, line.color, line.size));
};

const respond = async (res, cart, status = 200) =>
    res.status(status).json({ success: true, items: await hydrateCart(cart) });

const badRequest = (res, message) => res.status(400).json({ success: false, message });

const serverError = (res, where, error) => {
    console.error(`${where} error:`, error?.message || error);
    return res.status(500).json({ success: false, message: "Server error updating your cart." });
};

/* ── GET /api/cart ── */
export const getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user.id });
        return respond(res, cart);
    } catch (error) {
        return serverError(res, "getCart", error);
    }
};

/* ── POST /api/cart/items  { productId, color, size, quantity } → add to a line ── */
export const addCartItem = async (req, res) => {
    try {
        const line = validateCartLine(req.body);
        if (!line.ok) return badRequest(res, line.message);
        if (!(await assertBuyable(line.value))) return badRequest(res, "This item is no longer available.");

        const result = await mutateCart(req.user.id, (cart) => {
            const existing = cart.items.find((l) => sameLine(l, line.value));
            if (existing) {
                existing.quantity = Math.min(CHECKOUT_LIMITS.MAX_QTY_PER_LINE, existing.quantity + line.value.quantity);
                return null;
            }
            if (cart.items.length >= CHECKOUT_LIMITS.MAX_LINES) {
                return { error: `Your cart can hold at most ${CHECKOUT_LIMITS.MAX_LINES} different items.` };
            }
            cart.items.push(line.value);
            return null;
        });
        if (result.error) return badRequest(res, result.error);
        return respond(res, result.cart);
    } catch (error) {
        return serverError(res, "addCartItem", error);
    }
};

/* ── PUT /api/cart/items  { productId, color, size, quantity } → set a line's quantity ── */
export const setCartItemQuantity = async (req, res) => {
    try {
        const line = validateCartLine(req.body);
        if (!line.ok) return badRequest(res, line.message);

        const result = await mutateCart(req.user.id, (cart) => {
            const existing = cart.items.find((l) => sameLine(l, line.value));
            if (!existing) return { error: "That item isn't in your cart." };
            existing.quantity = line.value.quantity;
            return null;
        });
        if (result.error) return badRequest(res, result.error);
        return respond(res, result.cart);
    } catch (error) {
        return serverError(res, "setCartItemQuantity", error);
    }
};

/* ── DELETE /api/cart/items  { productId, color, size } → remove a line ── */
export const removeCartItem = async (req, res) => {
    try {
        const line = validateCartLine(req.body, { requireQuantity: false });
        if (!line.ok) return badRequest(res, line.message);

        const result = await mutateCart(req.user.id, (cart) => {
            cart.items = cart.items.filter((l) => !sameLine(l, line.value));
        });
        return respond(res, result.cart);
    } catch (error) {
        return serverError(res, "removeCartItem", error);
    }
};

/* ── DELETE /api/cart → empty the cart ── */
export const clearCart = async (req, res) => {
    try {
        await Cart.updateOne({ user: req.user.id }, { $set: { items: [] } });
        return res.json({ success: true, items: [] });
    } catch (error) {
        return serverError(res, "clearCart", error);
    }
};

/* ══════════════════════════════════════════════════════════════
   POST /api/cart/merge  { items: [{ productId, color, size, quantity }] }

   Called once when a customer signs in, with the cart they built
   while signed out. Lines are added into the saved cart; where the
   same item is in both, quantities are added together (capped at
   the per-line maximum). Invalid or unavailable lines are skipped
   rather than failing the whole merge — the customer just signed
   in and should not be shown an error about a stale item.
   ══════════════════════════════════════════════════════════════ */
export const mergeCart = async (req, res) => {
    try {
        const incoming = Array.isArray(req.body?.items) ? req.body.items.slice(0, CHECKOUT_LIMITS.MAX_LINES) : null;
        if (!incoming) return badRequest(res, "items must be an array.");

        const valid = [];
        for (const raw of incoming) {
            const line = validateCartLine(raw);
            if (line.ok && (await assertBuyable(line.value))) valid.push(line.value);
        }

        const result = await mutateCart(req.user.id, (cart) => {
            for (const line of valid) {
                const existing = cart.items.find((l) => sameLine(l, line));
                if (existing) {
                    existing.quantity = Math.min(CHECKOUT_LIMITS.MAX_QTY_PER_LINE, existing.quantity + line.quantity);
                } else if (cart.items.length < CHECKOUT_LIMITS.MAX_LINES) {
                    cart.items.push(line);
                }
            }
        });
        return respond(res, result.cart);
    } catch (error) {
        return serverError(res, "mergeCart", error);
    }
};
