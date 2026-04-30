/**
 * Variant utilities (server-side).
 * The product variant is the unit of inventory and pricing:
 *   { color, size, price, stock }
 */

/**
 * Normalise + validate a variants payload coming from the client.
 * Returns { ok: true, variants } or { ok: false, message }.
 *
 * @param {Array} rawVariants
 * @param {Array<{colorName:string}>} colors  the product's color list
 */
export const validateVariants = (rawVariants, colors = []) => {
    if (!Array.isArray(rawVariants) || rawVariants.length === 0) {
        return { ok: false, message: "Please add at least one variant (color × size)." };
    }

    const knownColors = new Set((colors || []).map((c) => c.colorName));
    const seen = new Set();
    const cleaned = [];

    for (const v of rawVariants) {
        const color = String(v?.color || "").trim();
        const size = String(v?.size || "").trim();
        const price = Number(v?.price);
        const stock = Number(v?.stock);

        if (!color || !size) {
            return { ok: false, message: "Every variant must have a color and a size." };
        }
        if (knownColors.size > 0 && !knownColors.has(color)) {
            return { ok: false, message: `Variant color "${color}" has no matching color images.` };
        }
        if (!Number.isFinite(price) || price <= 0) {
            return { ok: false, message: `Variant ${color}/${size} needs a valid price.` };
        }
        if (!Number.isFinite(stock) || stock < 0) {
            return { ok: false, message: `Variant ${color}/${size} needs a non-negative stock.` };
        }

        const key = `${color}__${size}`;
        if (seen.has(key)) {
            return { ok: false, message: `Duplicate variant for ${color} / ${size}.` };
        }
        seen.add(key);

        cleaned.push({ color, size, price, stock });
    }

    return { ok: true, variants: cleaned };
};

/**
 * Locate the variant matching (color, size) on a product. Color match is
 * required; size match is required if any variants for that color exist.
 */
export const findVariant = (product, color, size) => {
    if (!product?.variants?.length) return null;
    return product.variants.find(
        (v) => v.color === color && v.size === size
    ) || null;
};
