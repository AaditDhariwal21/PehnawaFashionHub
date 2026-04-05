/**
 * Get the effective price for a product + selected size.
 * Priority: size-specific price > sellingPrice > baseMRP (price)
 */
export function getEffectivePrice(product, selectedSize) {
    if (selectedSize) {
        const sizeEntry = product.sizes?.find((s) => s.size === selectedSize);
        if (sizeEntry?.price != null) return sizeEntry.price;
    }
    if (product.sellingPrice != null) return product.sellingPrice;
    return product.price;
}

/**
 * Get the display price for product cards (no size selected).
 * Shows sellingPrice if exists, else baseMRP.
 */
export function getCardPrice(product) {
    if (product.sellingPrice != null) return product.sellingPrice;
    return product.price;
}

/**
 * Whether to show a discount (strikethrough MRP).
 */
export function shouldShowDiscount(product, selectedSize) {
    return getEffectivePrice(product, selectedSize) < product.price;
}
