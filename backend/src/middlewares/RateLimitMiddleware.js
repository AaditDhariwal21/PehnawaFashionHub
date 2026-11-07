import rateLimit from "express-rate-limit";
import { normalizeEmailKey } from "../utils/checkoutValidation.js";

/**
 * Rate limits for the endpoints that are worth abusing: credential guessing,
 * checkout/order spam, guest order lookups, and anything that spends money on
 * a third-party API (Square payment links, Shippo rate quotes).
 *
 * In-memory store: correct for the single Render instance this runs on, and
 * reset on every deploy/restart. If the backend is ever scaled to more than one
 * instance, swap in a shared store (e.g. rate-limit-mongo) or each instance
 * will enforce its own, separate budget.
 *
 * IMPORTANT: these key on req.ip, which is only the real client address when
 * `trust proxy` matches the number of proxies in front of the app (see
 * TRUST_PROXY_HOPS in index.js). If it is wrong, every visitor shares one
 * bucket. Limits that can include an email do so, so even then they stay
 * per-customer.
 *
 * Every rejection uses the same response shape as the rest of the API.
 */

const MINUTE = 60 * 1000;

/**
 * IPv6 clients usually control a whole /64, so keying on the full address
 * would let one client rotate through billions of keys. Group by /64 instead.
 */
const clientIpKey = (req) => {
    const ip = String(req.ip || "unknown");
    if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip;
    return ip.split(":").slice(0, 4).join(":") + "::/64";
};

/** Normalised email from the request body, if one is present and is a string. */
const bodyEmailKey = (req) => {
    const email = req.body?.email;
    return typeof email === "string" && email.length <= 254 ? normalizeEmailKey(email) : "";
};

const rejected = (req, res, _next, options) =>
    res.status(options.statusCode).json({
        success: false,
        code: "RATE_LIMITED",
        message: "Too many attempts. Please wait a few minutes and try again.",
    });

const limiter = ({ windowMs, limit, keyGenerator = clientIpKey, skip }) =>
    rateLimit({
        windowMs,
        limit,
        keyGenerator,
        skip,
        standardHeaders: "draft-7",
        legacyHeaders: false,
        handler: rejected,
    });

const byIpAndEmail = (req) => `${clientIpKey(req)}|${bodyEmailKey(req)}`;
const byEmailOnly = (req) => `email|${bodyEmailKey(req)}`;
const hasBodyEmail = (req) => !bodyEmailKey(req);

/* ── Accounts ── */

/** Guessing one account's password: per IP + email. */
export const loginAttemptLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10, keyGenerator: byIpAndEmail });
/** Spraying many accounts from one address. */
export const authIpLimiter = limiter({ windowMs: 15 * MINUTE, limit: 50 });

/* ── Checkout ── */

/** Creating Square payment links (both account and guest checkout). */
export const checkoutLimiter = limiter({ windowMs: 15 * MINUTE, limit: 20 });
/** Guest checkouts per email, across addresses. Skipped when no email was sent (validation rejects those). */
export const guestCheckoutEmailLimiter = limiter({
    windowMs: 60 * MINUTE,
    limit: 10,
    keyGenerator: byEmailOnly,
    skip: hasBodyEmail,
});
/** Confirming a payment (customer-initiated fallback). */
export const confirmLimiter = limiter({ windowMs: 15 * MINUTE, limit: 30 });

/* ── Guest orders ── */

/** Viewing an order by private link. Generous: the confirmation page polls it. */
export const guestOrderViewLimiter = limiter({ windowMs: 15 * MINUTE, limit: 120 });
/** Order number + email lookup: per IP. */
export const guestLookupIpLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10 });
/** Order number + email lookup: per email, across addresses. */
export const guestLookupEmailLimiter = limiter({
    windowMs: 60 * MINUTE,
    limit: 10,
    keyGenerator: byEmailOnly,
    skip: hasBodyEmail,
});
/** Attaching a guest order to an account. */
export const guestClaimLimiter = limiter({ windowMs: 15 * MINUTE, limit: 20 });

/* ── Other public endpoints that cost something ── */

/** Promo "Apply" — guessing codes. */
export const promoValidateLimiter = limiter({ windowMs: 15 * MINUTE, limit: 30 });
/** Shippo rate quotes. */
export const shippingRateLimiter = limiter({ windowMs: 15 * MINUTE, limit: 40 });
/** Saved-cart edits: every +/- tap is a request, so this is only a flood guard. */
export const cartLimiter = limiter({ windowMs: 15 * MINUTE, limit: 600 });
