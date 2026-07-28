/**
 * Product taxonomy — gender, gender-scoped categories, and special tags.
 *
 * MIRROR of backend/src/config/productTaxonomy.js, which is canonical because
 * schema validation must not depend on the client. Backend and frontend are
 * separately deployed packages with no shared module resolution (the same
 * reason utils/variants.js exists in both trees), so the two copies are kept
 * in sync mechanically: backend/src/scripts/verifyProductTaxonomy.js compares
 * them and fails if they diverge. Edit both, or edit the backend and re-run
 * that script.
 *
 * Category is nested under gender — a product's category must belong to its
 * gender's list. Special tags are a separate, independent facet and must never
 * appear in category navigation or category filters.
 */

export const GENDERS = ['Men', 'Women', 'Kids'];

export const CATEGORIES_BY_GENDER = {
    Men: [
        "Men's Kurta",
    ],
    Women: [
        'Anarkalis',
        'Coord Sets',
        'Lehengas',
        'Indo Western',
        'Suits & Kurtis',
        'Sarees',
        'Blouses',
        'Dupattas',
        'Navratri Chaniya Choli',
    ],
    /* Boys/Girls is the final level for Kids by deliberate decision — there is
       no garment-type level beneath it. */
    Kids: [
        'Boys',
        'Girls',
    ],
};

/** Manual admin toggles only — no auto-expiry, no derivation from discounts. */
export const SPECIAL_TAGS = ['New Arrival', 'Bestseller', 'Sale'];

/** Every valid category across all genders, flattened. */
export const ALL_CATEGORIES = Object.values(CATEGORIES_BY_GENDER).flat();

export const categoriesForGender = (gender) => CATEGORIES_BY_GENDER[gender] || [];

export const isValidCategoryForGender = (gender, category) =>
    categoriesForGender(gender).includes(category);

/** Which gender owns a category name; null rather than a guess if ambiguous. */
export const genderForCategory = (category) => {
    const owners = GENDERS.filter((g) => CATEGORIES_BY_GENDER[g].includes(category));
    return owners.length === 1 ? owners[0] : null;
};

export default CATEGORIES_BY_GENDER;
