/**
 * Variant utilities (client-side).
 *
 * A variant is the unit of inventory and pricing on a product:
 *   { color, size, price, stock }
 *
 * Helpers below derive UI state from `product.variants` without
 * duplicating logic across pages.
 */

/* ── Lookups ─────────────────────────────────────────────────── */

export const variantsForColor = (product, color) =>
    (product?.variants || []).filter((v) => v.color === color);

export const findVariant = (product, color, size) =>
    (product?.variants || []).find((v) => v.color === color && v.size === size) || null;

/* ── Color/size axes ─────────────────────────────────────────── */

/**
 * Distinct colors that have at least one variant. Order is taken from
 * `product.colors` (the admin's curated order), so the UI is stable.
 */
export const colorsWithVariants = (product) => {
    const present = new Set((product?.variants || []).map((v) => v.color));
    return (product?.colors || [])
        .map((c) => c.colorName)
        .filter((name) => present.has(name));
};

/**
 * Union of sizes across the whole product, in first-seen order. Used
 * to render a stable size row regardless of which color is picked.
 */
export const allSizes = (product) => {
    const seen = new Set();
    const out = [];
    for (const v of product?.variants || []) {
        if (!seen.has(v.size)) {
            seen.add(v.size);
            out.push(v.size);
        }
    }
    return out;
};

/* ── Stock + status ──────────────────────────────────────────── */

/**
 * State of a (color, size) cell used to render size buttons.
 *   - 'available'  : variant exists and has stock
 *   - 'sold-out'   : variant exists but stock === 0
 *   - 'unavailable': no variant exists for this color/size pair
 */
export const sizeStatus = (product, color, size) => {
    const v = findVariant(product, color, size);
    if (!v) return 'unavailable';
    if (v.stock <= 0) return 'sold-out';
    return 'available';
};

export const colorHasStock = (product, color) =>
    variantsForColor(product, color).some((v) => v.stock > 0);

export const totalStock = (product) =>
    (product?.variants || []).reduce((s, v) => s + (Number(v.stock) || 0), 0);

/* ── Pricing ─────────────────────────────────────────────────── */

/**
 * The cheapest variant price (used on cards as a "starting from" price).
 * Falls back to product.price for products with no variants.
 */
export const startingPrice = (product) => {
    const prices = (product?.variants || []).map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
    if (prices.length === 0) return Number(product?.price) || 0;
    return Math.min(...prices);
};

/**
 * Price to display when a variant is selected. Returns the variant
 * price or, if no variant is selected, the starting price.
 */
export const displayPrice = (product, color, size) => {
    const v = findVariant(product, color, size);
    if (v) return Number(v.price);
    return startingPrice(product);
};

/**
 * Whether to show a strikethrough MRP (product.price > effective price).
 */
export const hasDiscount = (product, color, size) =>
    displayPrice(product, color, size) < Number(product?.price || 0);

/* ── Default selection ───────────────────────────────────────── */

/**
 * Pick the first color that has at least one in-stock variant, falling
 * back to the first color with any variant, then the product's first
 * color name.
 */
export const defaultColor = (product) => {
    const colors = colorsWithVariants(product);
    return (
        colors.find((c) => colorHasStock(product, c)) ||
        colors[0] ||
        product?.colors?.[0]?.colorName ||
        ''
    );
};

/* ── Admin matrix helpers ────────────────────────────────────── */

/**
 * Build/refresh a variant matrix from chosen color + size axes,
 * preserving any values already entered on existing rows.
 *
 * @param {string[]} colors  active colors
 * @param {string[]} sizes   active sizes
 * @param {Array}    existing  variants already in state
 * @returns {Array} rebuilt variants, one row per (color × size)
 */
export const buildVariantMatrix = (colors, sizes, existing = []) => {
    const lookup = new Map(existing.map((v) => [`${v.color}__${v.size}`, v]));
    const out = [];
    for (const color of colors) {
        for (const size of sizes) {
            const key = `${color}__${size}`;
            const prev = lookup.get(key);
            out.push(prev || { color, size, price: '', stock: '' });
        }
    }
    return out;
};
