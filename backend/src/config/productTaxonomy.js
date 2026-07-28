/**
 * CANONICAL product taxonomy — the single source of truth for gender,
 * category and special tags.
 *
 * Category is nested under gender: a product's category must be a member of
 * its own gender's list. This replaces the previous free-form `category`
 * String, which had no enum and no validation, and which had already allowed
 * a misspelling ("Lehangas") into customer-facing URLs and let a special tag
 * ("New Arrivals") leak into category navigation.
 *
 * The frontend mirrors this file at frontend/src/utils/productCategories.js.
 * The backend copy is canonical because schema validation must not depend on
 * the client. Backend and frontend are separately deployed packages with no
 * shared module resolution — the same reason utils/variants.js already exists
 * in both trees — so the two are kept honest mechanically rather than by
 * convention: scripts/verifyProductTaxonomy.js fails loudly if they diverge.
 */

export const GENDERS = ["Men", "Women", "Kids"];

export const CATEGORIES_BY_GENDER = {
    Men: [
        "Men's Kurta",
    ],
    Women: [
        "Anarkalis",
        "Coord Sets",
        "Lehengas",
        "Indo Western",
        "Suits & Kurtis",
        "Sarees",
        "Blouses",
        "Dupattas",
        "Navratri Chaniya Choli",
    ],
    /* Boys/Girls is the final level for Kids by deliberate decision — there is
       no garment-type level beneath it. */
    Kids: [
        "Boys",
        "Girls",
    ],
};

/**
 * Special tags are an independent, optional, multi-value facet. They are NOT
 * categories and must never appear in category navigation or filters.
 *
 * Both are manual admin toggles: nothing here is auto-expired or derived from
 * discount state, by explicit decision.
 */
export const SPECIAL_TAGS = ["New Arrival", "Bestseller", "Sale"];

/** Every valid category across all genders, flattened. */
export const ALL_CATEGORIES = Object.values(CATEGORIES_BY_GENDER).flat();

export const isValidGender = (gender) => GENDERS.includes(gender);

/** A category is only valid in the context of a gender. */
export const isValidCategoryForGender = (gender, category) =>
    isValidGender(gender) && (CATEGORIES_BY_GENDER[gender] || []).includes(category);

/**
 * Which gender owns a category name. Category names are currently unique
 * across genders, so this is unambiguous — but it returns null rather than
 * guessing if that ever stops being true.
 */
export const genderForCategory = (category) => {
    const owners = GENDERS.filter((g) => CATEGORIES_BY_GENDER[g].includes(category));
    return owners.length === 1 ? owners[0] : null;
};

export const isValidSpecialTag = (tag) => SPECIAL_TAGS.includes(tag);
