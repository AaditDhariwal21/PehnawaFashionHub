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

/* ── Admin editor helpers ────────────────────────────────────── */

/**
 * The variants array is the single source of truth in the admin editor.
 *
 * It used to be *derived*, by regenerating the full colors × sizes cartesian
 * product on every edit. That one decision caused two separate bugs:
 *
 *   - adding a size fanned it out to every color, because a size existed on
 *     the product rather than on a color; and
 *   - deleting a combination could not survive, because a deletion was only
 *     an absence from a set that the next edit rebuilt from scratch.
 *
 * So there is deliberately no "rebuild the matrix" helper here. Every helper
 * below is an explicit, scoped edit to the variant list the admin can see.
 */

export const variantKey = (color, size) => `${color}__${size}`;

export const hasVariant = (variants, color, size) =>
    (variants || []).some((v) => v.color === color && v.size === size);

/** Sizes present for one color, in the order the admin added them. */
export const sizesForColor = (variants, color) =>
    (variants || []).filter((v) => v.color === color).map((v) => v.size);

/**
 * Add `size` to each of `targetColors`, skipping any (color, size) that
 * already exists. New rows start blank so the admin must enter price/stock
 * deliberately — a blank row is never invented for a color that was not
 * named in `targetColors`.
 *
 * @returns {{ variants: Array, added: string[], skipped: string[] }}
 */
export const addSizeToColors = (variants, targetColors, size) => {
    const trimmed = String(size || '').trim();
    if (!trimmed) return { variants, added: [], skipped: [] };

    const next = [...(variants || [])];
    const added = [];
    const skipped = [];

    for (const color of targetColors) {
        if (hasVariant(next, color, trimmed)) {
            skipped.push(`${color} / ${trimmed}`);
            continue;
        }
        next.push({ color, size: trimmed, price: '', stock: '' });
        added.push(`${color} / ${trimmed}`);
    }
    return { variants: next, added, skipped };
};

/** Remove `size` from the given colors only. */
export const removeSizeFromColors = (variants, targetColors, size) => {
    const scope = new Set(targetColors);
    return (variants || []).filter(
        (v) => !(scope.has(v.color) && v.size === size)
    );
};

/** Remove one (color, size) combination. This is the authoritative delete. */
export const removeVariant = (variants, color, size) =>
    (variants || []).filter((v) => !(v.color === color && v.size === size));

/**
 * Drop variants whose color is no longer on the product. Called when the
 * color list changes — the only implicit variant edit that remains, and it
 * only ever removes, so it can't resurrect a deleted combination.
 */
export const pruneVariantsToColors = (variants, colorNames) => {
    const known = new Set(colorNames);
    return (variants || []).filter((v) => known.has(v.color));
};

/* ── Admin validation ────────────────────────────────────────── */

const blank = (x) => x === null || x === undefined || String(x).trim() === '';

/**
 * Which of a variant's required fields are missing vs present-but-invalid.
 * Kept separate so the save error can say "is missing stock and price"
 * rather than a generic "fill in all fields".
 */
export const variantFieldIssues = (v) => {
    const missing = [];
    const invalid = [];

    if (blank(v?.price)) missing.push('price');
    else if (!Number.isFinite(Number(v.price)) || Number(v.price) <= 0) invalid.push('price');

    if (blank(v?.stock)) missing.push('stock');
    else if (!Number.isFinite(Number(v.stock)) || Number(v.stock) < 0) invalid.push('stock');

    return { missing, invalid };
};

export const isVariantComplete = (v) => {
    const { missing, invalid } = variantFieldIssues(v);
    return missing.length === 0 && invalid.length === 0;
};

const joinFields = (fields) =>
    fields.length === 2 ? `${fields[0]} and ${fields[1]}` : fields[0];

/**
 * A specific, admin-actionable save error naming every offending row, e.g.
 *   "Red / XL is missing stock and price."
 * Returns '' when every variant is complete.
 */
export const describeVariantProblems = (variants, maxListed = 4) => {
    const parts = [];

    for (const v of variants || []) {
        const { missing, invalid } = variantFieldIssues(v);
        const label = `${v.color} / ${v.size}`;
        if (missing.length) parts.push(`${label} is missing ${joinFields(missing)}`);
        if (invalid.length) parts.push(`${label} has an invalid ${joinFields(invalid)}`);
    }

    if (parts.length === 0) return '';

    const listed = parts.slice(0, maxListed);
    const rest = parts.length - listed.length;
    return `${listed.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}.`;
};
