/**
 * Get the images to display for a product given a selected color.
 * Falls back to the flat images array if no color is selected or no match.
 */
export function getDisplayImages(product, selectedColor) {
    if (selectedColor && product.colors?.length) {
        const colorEntry = product.colors.find((c) => c.colorName === selectedColor);
        if (colorEntry?.images?.length) return colorEntry.images;
    }
    return product.images || [];
}
