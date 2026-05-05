/**
 * Slug helpers.
 *
 * Slugs are part of every product URL, so two properties matter:
 *   1. Generation is deterministic and side-effect-free.
 *   2. A slug, once assigned to a product, never changes — even if the
 *      product's name or category changes. URL stability is a contract
 *      with the outside world (search engines, shared links).
 *
 * The pre-save hook in the Product model is the single place that
 * assigns slugs, and it only fills in missing values.
 */

export const generateSlug = (str) => {
    if (!str) return "";
    return String(str)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
};

/**
 * Returns a slug that does not collide with any existing document in
 * `Model`. Appends `-1`, `-2`, … until a free candidate is found.
 *
 * `ignoreId` lets a document keep its own slug during a re-save without
 * tripping over itself.
 */
export const ensureUniqueSlug = async (Model, base, ignoreId = null) => {
    const safeBase = base || "product";
    let candidate = safeBase;
    let counter = 1;
    while (true) {
        const query = { slug: candidate };
        if (ignoreId) query._id = { $ne: ignoreId };
        const exists = await Model.exists(query);
        if (!exists) return candidate;
        candidate = `${safeBase}-${counter++}`;
    }
};
