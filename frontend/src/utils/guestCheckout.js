/**
 * Guest checkout helpers shared by the checkout, confirmation and order details
 * pages.
 *
 * Storage:
 *   localStorage   pehnawa_guestCheckout  { squareOrderId, token, source, email, savedAt }
 *                  Written just before redirecting to Square. localStorage (not
 *                  sessionStorage) because some wallet/app payment flows return
 *                  the customer in a new tab. Removed as soon as the order is
 *                  confirmed, and ignored after a day.
 *   sessionStorage pehnawa_guestOrder     { token, email }
 *                  The confirmed order's private token, so a refresh of the
 *                  confirmation page still works. Gone when the tab closes.
 *
 * Every access is wrapped: storage can throw (Safari private mode, blocked
 * site data) and must never break checkout.
 */

const PENDING_KEY = 'pehnawa_guestCheckout';
const CONFIRMED_KEY = 'pehnawa_guestOrder';
const SOURCE_KEY = 'pehnawa_checkoutSource';
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const readJson = (storage, key) => {
    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeJson = (storage, key, value) => {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable — the confirmation page falls back to the order details lookup */
    }
};

const remove = (storage, key) => {
    try {
        storage.removeItem(key);
    } catch {
        /* ignore */
    }
};

export const saveGuestCheckout = ({ squareOrderId, token, source, email }) =>
    writeJson(localStorage, PENDING_KEY, { squareOrderId, token, source, email, savedAt: Date.now() });

export const readGuestCheckout = () => {
    const value = readJson(localStorage, PENDING_KEY);
    if (!value?.token || Date.now() - (value.savedAt || 0) > PENDING_MAX_AGE_MS) return null;
    return value;
};

export const clearGuestCheckout = () => remove(localStorage, PENDING_KEY);

export const saveConfirmedGuestOrder = ({ token, email }) =>
    writeJson(sessionStorage, CONFIRMED_KEY, { token, email });

export const readConfirmedGuestOrder = () => {
    const value = readJson(sessionStorage, CONFIRMED_KEY);
    return value?.token ? value : null;
};

/** Which kind of checkout the account customer just paid for: 'cart' | 'buyNow'. */
export const saveCheckoutSource = (source) => {
    try {
        sessionStorage.setItem(SOURCE_KEY, source);
    } catch {
        /* ignore */
    }
};

export const readCheckoutSource = () => {
    try {
        return sessionStorage.getItem(SOURCE_KEY) === 'buyNow' ? 'buyNow' : 'cart';
    } catch {
        return 'cart';
    }
};

/**
 * The private, bookmarkable link to a guest order. The token is in the
 * #fragment, which browsers never send to any server — so it can't end up in
 * access logs or Referer headers.
 */
export const guestOrderLink = (token) => `${window.location.origin}/order-details#t=${token}`;

/** Reads the token from /order-details#t=… (also the older /track-order#t=…) */
export const tokenFromHash = (hash) => {
    const match = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(hash || '');
    return match ? match[1] : null;
};

export const newCheckoutAttemptId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    /* RFC 4122 v4 from getRandomValues, for browsers without randomUUID. */
    const b = window.crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/* ── Field rules — mirror backend/src/utils/checkoutValidation.js.
      The server is the authority; these exist so the customer sees the
      problem inline before submitting. ── */

const EMAIL_REGEX = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;
const PHONE_REGEX = /^[+]?[\d\s\-().]{7,20}$/;
const POSTAL_CODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/;

export const CHECKOUT_FIELD_RULES = {
    email: { label: 'Email', max: 254, required: true, test: (v) => EMAIL_REGEX.test(v), hint: 'Please enter a valid email address.' },
    fullName: { label: 'Full Name', max: 100, required: true, test: (v) => v.length >= 2, hint: 'Please enter your full name.' },
    contactNumber: { label: 'Contact Number', max: 20, required: true, test: (v) => PHONE_REGEX.test(v), hint: 'Please enter a valid phone number (digits, spaces, + - ( ) only).' },
    street: { label: 'Street Address', max: 200, required: true },
    apartment: { label: 'Apartment / Suite', max: 200, required: false },
    city: { label: 'City', max: 100, required: true },
    state: { label: 'State / Province', max: 100, required: true },
    zip: { label: 'ZIP / Postal Code', max: 12, required: true, test: (v) => POSTAL_CODE_REGEX.test(v), hint: 'Please enter a valid ZIP / postal code.' },
};

/** @returns {string} an error message, or '' when the value is acceptable */
export const checkField = (name, rawValue) => {
    const rule = CHECKOUT_FIELD_RULES[name];
    if (!rule) return '';
    const value = String(rawValue ?? '').trim();
    if (!value) return rule.required ? `${rule.label} is required` : '';
    if (value.length > rule.max) return `${rule.label} must be at most ${rule.max} characters`;
    if (/[<>]/.test(value)) return `${rule.label} contains characters that aren't allowed`;
    if (rule.test && !rule.test(value)) return rule.hint;
    return '';
};

/** Server field names (create-checkout `field`) → checkout form field names. */
export const SERVER_FIELD_TO_FORM = {
    email: 'email',
    contactEmail: 'email',
    fullName: 'fullName',
    phone: 'contactNumber',
    addressLine1: 'street',
    addressLine2: 'apartment',
    city: 'city',
    state: 'state',
    zipCode: 'zip',
};
