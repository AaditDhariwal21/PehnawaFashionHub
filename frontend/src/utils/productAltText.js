/**
 * Return descriptive alt text for a product image.
 *
 *   1. If the image record carries an explicit `altText` that isn't a
 *      numeric-only placeholder (stray timestamp, Cloudinary publicId,
 *      etc.), prefer it.
 *   2. Otherwise fall back to the product's name.
 *   3. Last-resort fallback is "Product Image" so screen readers and
 *      crawlers never see an empty alt.
 *
 * The numeric-only guard exists because some legacy/imported records
 * had ids leaking into the alt slot — we never want to surface those
 * to assistive tech.
 */
export const getProductAltText = (product, image) => {
    const altText = image?.altText;
    if (altText && typeof altText === "string" && !/^\d+$/.test(altText.trim())) {
        return altText;
    }
    return product?.name || "Product Image";
};
