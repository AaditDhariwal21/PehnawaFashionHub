import crypto from "crypto";

/**
 * Server-side validation for everything a checkout request carries.
 *
 * Hand-rolled, like the rest of this codebase's validation (see
 * UserController.updateAddress), rather than pulling in a schema library.
 *
 * Every validator here does three jobs:
 *   1. Type-checks. Anything that is not the expected primitive is rejected
 *      outright, which is what stops NoSQL operator injection — an object such
 *      as {"$ne": null} can never reach a query as if it were a string.
 *   2. Whitelists. Callers get back a freshly built object containing only the
 *      known fields, so nothing else in the request body can be mass-assigned
 *      into a document.
 *   3. Normalises. Trimmed, control characters stripped, length-capped.
 *
 * Validators return { ok: true, value } or { ok: false, field?, message }.
 */

export const CHECKOUT_LIMITS = {
    MAX_LINES: 50,
    MAX_QTY_PER_LINE: 20,
};

/** The options the checkout page's country <select> offers. */
export const ALLOWED_COUNTRIES = ["United States", "Canada", "United Kingdom", "India"];

/* eslint-disable-next-line no-control-regex */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Same rule UserController.updateAddress applies to saved phone numbers. */
const PHONE_REGEX = /^[+]?[\d\s\-().]{7,20}$/;

/** International postal codes: letters, digits, spaces and hyphens. */
const POSTAL_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/;

const EMAIL_REGEX = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ok = (value) => ({ ok: true, value });
const fail = (message, field) => ({ ok: false, message, ...(field ? { field } : {}) });

/**
 * Clean one free-text field.
 *
 * Angle brackets are refused rather than escaped: no legitimate name or
 * address contains them, and refusing keeps markup out of the database
 * entirely. Output is still escaped wherever it is rendered (React does so
 * by default).
 */
const cleanText = (raw, { field, label, max, required }) => {
    if (raw === undefined || raw === null) {
        return required ? fail(`${label} is required.`, field) : ok("");
    }
    if (typeof raw !== "string") return fail(`${label} is invalid.`, field);

    const value = raw.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();

    if (!value) return required ? fail(`${label} is required.`, field) : ok("");
    if (value.length > max) return fail(`${label} must be at most ${max} characters.`, field);
    if (/[<>]/.test(value)) return fail(`${label} contains characters that aren't allowed.`, field);

    return ok(value);
};

/* ══════════════════════════════════════════════════════════════
   Email
   ══════════════════════════════════════════════════════════════ */

export const validateEmail = (raw, { field = "email", label = "Email" } = {}) => {
    if (raw === undefined || raw === null || raw === "") return fail(`${label} is required.`, field);
    if (typeof raw !== "string") return fail(`${label} is invalid.`, field);

    const value = raw.trim().toLowerCase();
    if (value.length > 254 || !EMAIL_REGEX.test(value)) {
        return fail("Please enter a valid email address.", field);
    }
    return ok(value);
};

/**
 * A canonical key for "is this the same mailbox?", used only to apply promo
 * limits to guests. It is never shown or used for delivery.
 *
 * Collapses the common free aliases — `+tag` suffixes everywhere, and dots in
 * Gmail local parts — so one person can't trivially multiply a one-per-customer
 * code. It cannot stop someone using genuinely different addresses; codes
 * worth protecting should also carry a total usage limit.
 */
export const normalizeEmailKey = (email) => {
    const lower = String(email || "").trim().toLowerCase();
    const at = lower.lastIndexOf("@");
    if (at < 1) return lower;

    let local = lower.slice(0, at);
    let domain = lower.slice(at + 1);

    local = local.split("+")[0];
    if (domain === "googlemail.com") domain = "gmail.com";
    if (domain === "gmail.com") local = local.replace(/\./g, "");

    return `${local}@${domain}`;
};

/* ══════════════════════════════════════════════════════════════
   Cart lines
   ══════════════════════════════════════════════════════════════ */

/**
 * Validates the cart a checkout is being created for.
 *
 * Quantities must be whole numbers from 1 to MAX_QTY_PER_LINE. Previously
 * `Number(qty) || 1` let fractional values (1.5) through to the Square charge
 * and the stock decrement, and negative values were only stopped incidentally.
 *
 * Note the client's `image` is deliberately not accepted: the order's image is
 * derived server-side from the product, so a stored URL can't be pointed
 * anywhere else.
 */
export const validateCartItems = (raw) => {
    if (!Array.isArray(raw) || raw.length === 0) return fail("Your cart is empty.", "cartItems");
    if (raw.length > CHECKOUT_LIMITS.MAX_LINES) {
        return fail(`A single order can contain at most ${CHECKOUT_LIMITS.MAX_LINES} different items.`, "cartItems");
    }

    const items = [];
    const seen = new Set();

    for (const ci of raw) {
        if (!ci || typeof ci !== "object" || Array.isArray(ci)) {
            return fail("Your cart contains an invalid item.", "cartItems");
        }

        const { productId, color, size, quantity } = ci;

        if (typeof productId !== "string" || !OBJECT_ID_REGEX.test(productId)) {
            return fail("Your cart contains an invalid item.", "cartItems");
        }

        const colorResult = cleanText(color, { field: "cartItems", label: "Colour", max: 60, required: false });
        if (!colorResult.ok) return colorResult;
        const sizeResult = cleanText(size, { field: "cartItems", label: "Size", max: 60, required: false });
        if (!sizeResult.ok) return sizeResult;

        if (typeof quantity !== "number" || !Number.isInteger(quantity)
            || quantity < 1 || quantity > CHECKOUT_LIMITS.MAX_QTY_PER_LINE) {
            return fail(
                `Quantity must be a whole number between 1 and ${CHECKOUT_LIMITS.MAX_QTY_PER_LINE}.`,
                "cartItems"
            );
        }

        const key = `${productId}|${colorResult.value}|${sizeResult.value}`;
        if (seen.has(key)) return fail("Your cart contains the same item twice.", "cartItems");
        seen.add(key);

        items.push({ productId, color: colorResult.value, size: sizeResult.value, quantity });
    }

    return ok(items);
};

/** One line for the saved-cart endpoints — same rules as a checkout line. */
export const validateCartLine = (raw, { requireQuantity = true } = {}) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Invalid cart item.");
    const probe = { ...raw, quantity: requireQuantity ? raw.quantity : 1 };
    const result = validateCartItems([probe]);
    if (!result.ok) return result;
    return ok(result.value[0]);
};

/* ══════════════════════════════════════════════════════════════
   Shipping address
   ══════════════════════════════════════════════════════════════ */

export const validateShippingAddress = (raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return fail("Shipping address is required.", "shippingAddress");
    }

    const fields = [
        ["fullName", "Full name", 100, true],
        ["phone", "Phone number", 20, true],
        ["addressLine1", "Address", 200, true],
        ["addressLine2", "Apartment / suite", 200, false],
        ["city", "City", 100, true],
        ["state", "State / province", 100, true],
        ["zipCode", "ZIP / postal code", 12, true],
    ];

    const value = {};
    for (const [field, label, max, required] of fields) {
        const result = cleanText(raw[field], { field, label, max, required });
        if (!result.ok) return result;
        value[field] = result.value;
    }

    if (value.fullName.length < 2) return fail("Please enter your full name.", "fullName");
    if (!PHONE_REGEX.test(value.phone)) return fail("Please enter a valid phone number.", "phone");
    if (!POSTAL_CODE_REGEX.test(value.zipCode)) return fail("Please enter a valid ZIP / postal code.", "zipCode");

    const country = raw.country === undefined || raw.country === null || raw.country === ""
        ? "United States"
        : raw.country;
    if (typeof country !== "string" || !ALLOWED_COUNTRIES.includes(country)) {
        return fail("Please choose a supported country.", "country");
    }
    value.country = country;

    return ok(value);
};

/* ══════════════════════════════════════════════════════════════
   Misc request fields
   ══════════════════════════════════════════════════════════════ */

/** Optional client-generated idempotency key (crypto.randomUUID()). */
export const validateCheckoutAttemptId = (raw) => {
    if (raw === undefined || raw === null || raw === "") return ok(null);
    if (typeof raw !== "string" || !UUID_REGEX.test(raw)) return fail("Invalid checkout attempt.", "checkoutAttemptId");
    return ok(raw.toLowerCase());
};

export const validatePromoCodeInput = (raw) => {
    if (raw === undefined || raw === null || raw === "") return ok(null);
    if (typeof raw !== "string" || raw.length > 40) return fail("Invalid promo code.", "promoCode");
    return ok(raw);
};

export const isValidObjectIdString = (raw) => typeof raw === "string" && OBJECT_ID_REGEX.test(raw);

/** Stable digest of a request's meaningful content, for idempotent replays. */
export const fingerprint = (value) =>
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
