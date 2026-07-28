/**
 * Maps the machine-readable failure reasons from the promo API to customer copy.
 *
 * The backend's `code` is the contract; its `message` is a fallback for a code
 * this map hasn't caught up with yet. Showing a generic "invalid code" for
 * everything is the thing this exists to avoid — "you've already used this
 * code" and "this code expired" send the customer to very different next
 * actions.
 */
const PROMO_ERROR_COPY = {
    PROMO_CODE_REQUIRED: 'Enter a promo code to apply.',
    PROMO_CART_EMPTY: 'Add something to your cart before applying a code.',
    PROMO_NOT_FOUND: "We don't recognise that code. Check the spelling and try again.",
    PROMO_INACTIVE: 'This code is no longer available.',
    PROMO_NOT_STARTED: "This code isn't active yet.",
    PROMO_EXPIRED: 'This code has expired.',
    PROMO_MIN_ORDER_NOT_MET: 'Your order is below the minimum for this code.',
    PROMO_LIMIT_REACHED: 'This code has been fully claimed.',
    PROMO_USER_LIMIT_REACHED: "You've already used this code.",
    PROMO_FIRST_ORDER_ONLY: 'This code is only valid on a first order.',
    PROMO_NO_ELIGIBLE_ITEMS: "This code doesn't apply to any items in your cart.",
};

/**
 * @param {object} data the parsed error response: { code?, message?, minOrderValue?, cartSubtotal? }
 * @param {(n: number) => string} formatMoney used to render the shortfall on a
 *        minimum-order failure, so the customer is told how much more to add
 * @returns {string}
 */
export const promoErrorMessage = (data, formatMoney) => {
    if (!data) return 'Could not apply that code. Please try again.';

    if (
        data.code === 'PROMO_MIN_ORDER_NOT_MET' &&
        typeof data.minOrderValue === 'number' &&
        typeof data.cartSubtotal === 'number' &&
        formatMoney
    ) {
        const shortfall = data.minOrderValue - data.cartSubtotal;
        return `Spend ${formatMoney(shortfall)} more to use this code (minimum ${formatMoney(data.minOrderValue)}).`;
    }

    return (
        PROMO_ERROR_COPY[data.code] ||
        data.message ||
        'Could not apply that code. Please try again.'
    );
};

export default PROMO_ERROR_COPY;
