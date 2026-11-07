import { validateEmail, normalizeEmailKey } from "../utils/checkoutValidation.js";
import { hashGuestToken, isWellFormedGuestToken, presentOrderForGuest } from "../utils/guestAccess.js";

/**
 * Middleware for the guest checkout / guest order routes.
 *
 * These routes never read an Authorization header. A guest is identified only
 * by what these functions establish: a validated email at checkout, and
 * afterwards possession of the private order token.
 */

/** Same message for every kind of bad link, so a probe learns nothing. */
export const GUEST_LINK_INVALID_MESSAGE = "This order link is invalid or has expired.";

/**
 * Feature flag. Off unless GUEST_CHECKOUT_ENABLED is exactly "true", so a
 * deploy without the variable keeps today's behaviour (sign-in required).
 * Turning it off later is the rollback: the routes 404 and the storefront
 * falls back to asking the customer to sign in. Guest orders already placed
 * are unaffected and stay visible to the admin.
 */
export const isGuestCheckoutEnabled = () => process.env.GUEST_CHECKOUT_ENABLED === "true";

export const requireGuestCheckoutEnabled = (req, res, next) => {
    if (!isGuestCheckoutEnabled()) {
        return res.status(404).json({
            success: false,
            code: "GUEST_CHECKOUT_DISABLED",
            message: "Guest checkout isn't available right now. Please sign in to place your order.",
        });
    }
    next();
};

/** Validates the guest's email and fixes it as the owner identity for this checkout. */
export const prepareGuestCheckout = (req, res, next) => {
    const email = validateEmail(req.body?.email);
    if (!email.ok) {
        return res.status(400).json({
            success: false,
            code: "VALIDATION_ERROR",
            field: "email",
            message: email.message,
        });
    }
    req.guestCheckout = { email: email.value, emailKey: normalizeEmailKey(email.value) };
    next();
};

/**
 * Resolves the private token in the request body into the filters the
 * handlers query with. A malformed token is rejected here, before any query,
 * with the same response as one that simply matches nothing.
 *
 * Sets:
 *   req.guestTokenHash      SHA-256 of the token
 *   req.guestPendingFilter  owner filter for PendingOrder (consumed by confirmPayment)
 *   req.presentOrder        the whitelist presenter every order response goes through
 */
export const resolveGuestToken = (req, res, next) => {
    const token = req.body?.token;
    if (!isWellFormedGuestToken(token)) {
        return res.status(404).json({ success: false, code: "ORDER_LINK_INVALID", message: GUEST_LINK_INVALID_MESSAGE });
    }
    req.guestTokenHash = hashGuestToken(token);
    req.guestPendingFilter = { isGuest: true, "guest.accessTokenHash": req.guestTokenHash };
    req.presentOrder = (order) => presentOrderForGuest(order);
    next();
};
