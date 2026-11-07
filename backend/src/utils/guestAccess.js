import crypto from "crypto";

/**
 * Guest order access.
 *
 * A guest has no account, so possession of an unguessable token is what
 * proves an order is theirs. The token is created when the checkout is
 * created, handed to the browser once, and only its SHA-256 hash is stored —
 * on the PendingOrder and then on the Order. A database leak therefore does
 * not leak working order links.
 *
 * The token travels to the server in request BODIES only, never in a query
 * string, so it does not end up in access logs. The shareable "save this link"
 * URL carries it in the #fragment, which browsers never send to any server.
 */

const TOKEN_BYTES = 32;

/** How long a guest order link keeps working. */
export const GUEST_LINK_TTL_DAYS = Number(process.env.GUEST_ORDER_LINK_TTL_DAYS) || 365;

export const generateGuestToken = () => crypto.randomBytes(TOKEN_BYTES).toString("base64url");

export const hashGuestToken = (token) =>
    crypto.createHash("sha256").update(String(token)).digest("hex");

/** 32 bytes in base64url is exactly 43 characters. Anything else is rejected before any query. */
export const isWellFormedGuestToken = (token) =>
    typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

export const guestLinkExpiry = () =>
    new Date(Date.now() + GUEST_LINK_TTL_DAYS * 24 * 60 * 60 * 1000);

export const maskEmail = (email) => {
    const value = String(email || "");
    const at = value.indexOf("@");
    if (at < 1) return "";
    const local = value.slice(0, at);
    const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
    return `${visible}${"•".repeat(Math.max(1, Math.min(6, local.length - visible.length)))}${value.slice(at)}`;
};

export const maskPhone = (phone) => {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length < 4) return "";
    return `•••• ${digits.slice(-4)}`;
};

/**
 * The ONLY shape in which an order is ever returned to a guest.
 *
 * Built field-by-field from a whitelist rather than by deleting fields from
 * the document, so a field added to the Order schema later is not exposed
 * here by accident. Internal fields (Mongo _id, user, payment ids, inventory
 * ledger, fulfilment hold, token hashes, promo ids) are never included.
 *
 * @param {object}  order
 * @param {object}  [opts]
 * @param {boolean} [opts.limited] the order-number + email lookup proves less
 *        than holding the private link does, so it gets a reduced view: no
 *        street address, postcode or phone.
 */
export const presentOrderForGuest = (order, { limited = false } = {}) => {
    const addr = order.shippingAddress || {};
    const firstName = String(addr.fullName || "").split(" ")[0];

    return {
        orderId: order.orderId,
        createdAt: order.createdAt,
        orderStatus: order.orderStatus,
        isPaid: !!order.isPaid,
        paidAt: order.paidAt || null,
        items: (order.items || []).map((i) => ({
            name: i.name,
            image: i.image,
            size: i.size,
            color: i.color,
            price: i.price,
            quantity: i.quantity,
        })),
        subtotal: order.subtotal,
        discountAmount: order.discountAmount || 0,
        promoCode: order.promo?.code || null,
        shippingCost: order.shippingCost,
        totalAmount: order.totalAmount,
        contactEmail: maskEmail(order.contactEmail),
        isGuest: true,
        claimed: !!order.user,
        shippingAddress: limited
            ? { fullName: firstName, city: addr.city, state: addr.state, country: addr.country }
            : {
                fullName: addr.fullName,
                addressLine1: addr.addressLine1,
                addressLine2: addr.addressLine2,
                city: addr.city,
                state: addr.state,
                zipCode: addr.zipCode,
                country: addr.country,
                phone: maskPhone(addr.phone),
            },
        limitedView: !!limited,
    };
};
