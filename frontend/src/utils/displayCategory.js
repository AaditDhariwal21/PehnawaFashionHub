/**
 * Display-layer category normalization.
 *
 * The schema only has three valid category names: Men, Women, Kids.
 * Legacy product records may still carry "Kidswear" in their
 * `category` field until the backfill migration runs. Anywhere a
 * category string is shown to a user — labels, breadcrumbs, listing
 * chips, navigation targets — funnel it through this helper so the
 * UI is consistent regardless of the underlying record's state.
 *
 * Once the migration is run end-to-end and `Kidswear` no longer
 * appears in the database, this helper becomes a no-op (still safe).
 */
const ALIASES = {
    kidswear: "Kids",
};

export const displayCategory = (category) => {
    if (!category) return category;
    return ALIASES[String(category).toLowerCase()] || category;
};
