/**
 * Build the canonical /product URL for a product-like object.
 *
 * Prefers the slug-based path. Falls back to the legacy /product/:id
 * shape when slugs are missing — the backend serves those and answers
 * with a `redirectTo` payload, so the page still ends up on the
 * canonical URL.
 *
 * Accepts either a full product object or a (slug, categorySlug, id)
 * triple from a denormalized record (e.g. cart line items).
 */
export const productUrl = ({ slug, categorySlug, _id, id } = {}) => {
    if (slug && categorySlug) return `/product/${categorySlug}/${slug}`;
    return `/product/${_id || id}`;
};
