/**
 * Format a numeric price for display with USD currency symbol.
 * @param {number} price – raw price value from database
 * @param {object} [opts] – options passed to toLocaleString
 * @returns {string} e.g. "$1,299.00"
 */
export const formatPrice = (price, opts = {}) => {
    const num = Number(price);
    if (isNaN(num)) return '$0.00';
    return `$${num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...opts,
    })}`;
};

export default formatPrice;
