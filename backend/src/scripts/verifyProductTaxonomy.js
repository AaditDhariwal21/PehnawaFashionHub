/**
 * Assert that the frontend taxonomy mirror matches the canonical backend one,
 * and that the schema actually enforces the gender/category pairing.
 *
 * Run with:
 *   node src/scripts/verifyProductTaxonomy.js
 *
 * The two copies exist because backend and frontend are separately deployed
 * packages with no shared module resolution — the same reason utils/variants.js
 * is duplicated across both trees. Duplication is the established convention
 * here; what was missing was any mechanism to notice when the copies drift.
 * This is that mechanism. Run it before deploying a taxonomy change.
 *
 * Requires no database for the parity checks; connects only for the schema
 * validation checks, which use an unsaved in-memory document.
 */

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Product from "../models/Products.js";
import {
    GENDERS,
    CATEGORIES_BY_GENDER,
    SPECIAL_TAGS,
    genderForCategory,
    isValidCategoryForGender,
} from "../config/productTaxonomy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIRROR = path.resolve(here, "../../../frontend/src/utils/productCategories.js");

let passed = 0;
let failed = 0;
const check = (label, ok, detail = "") => {
    if (ok) { passed += 1; console.log(`  ✓ ${label}`); }
    else { failed += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

/* ── 1. Parity with the frontend mirror ── */
console.log("\nTaxonomy parity (backend canonical vs frontend mirror)\n");

if (!fs.existsSync(MIRROR)) {
    check("frontend mirror exists", false, MIRROR);
} else {
    /* Imported as a module rather than text-compared, so formatting and comment
       differences don't produce false failures — only the values matter. */
    const mirror = await import(`file://${MIRROR}`);

    check("GENDERS match",
        JSON.stringify(mirror.GENDERS) === JSON.stringify(GENDERS),
        `frontend=${JSON.stringify(mirror.GENDERS)} backend=${JSON.stringify(GENDERS)}`);

    check("SPECIAL_TAGS match",
        JSON.stringify(mirror.SPECIAL_TAGS) === JSON.stringify(SPECIAL_TAGS),
        `frontend=${JSON.stringify(mirror.SPECIAL_TAGS)} backend=${JSON.stringify(SPECIAL_TAGS)}`);

    for (const gender of GENDERS) {
        check(`categories match for ${gender}`,
            JSON.stringify(mirror.CATEGORIES_BY_GENDER?.[gender]) ===
            JSON.stringify(CATEGORIES_BY_GENDER[gender]),
            `frontend=${JSON.stringify(mirror.CATEGORIES_BY_GENDER?.[gender])} backend=${JSON.stringify(CATEGORIES_BY_GENDER[gender])}`);
    }

    check("frontend declares no extra genders",
        Object.keys(mirror.CATEGORIES_BY_GENDER ?? {}).length === GENDERS.length,
        `frontend keys=${JSON.stringify(Object.keys(mirror.CATEGORIES_BY_GENDER ?? {}))}`);
}

/* ── 2. Internal consistency of the taxonomy itself ── */
console.log("\nTaxonomy internal consistency\n");

const flat = Object.values(CATEGORIES_BY_GENDER).flat();
check("no duplicate category names across genders",
    new Set(flat).size === flat.length,
    `${flat.length} entries, ${new Set(flat).size} distinct`);

check("every gender has at least one category",
    GENDERS.every((g) => (CATEGORIES_BY_GENDER[g] ?? []).length > 0));

check("genderForCategory resolves every category unambiguously",
    flat.every((c) => genderForCategory(c) !== null));

check('"Pashminas" is gone (merged into Dupattas)', !flat.includes("Pashminas"));
check('"Lehengas" is spelled correctly and "Lehangas" is absent',
    flat.includes("Lehengas") && !flat.includes("Lehangas"));
check('"Trending" is not a special tag', !SPECIAL_TAGS.includes("Trending"));
check('"Bestseller" is one word', SPECIAL_TAGS.includes("Bestseller") && !SPECIAL_TAGS.includes("Best Seller"));
check("no special tag is also a category name",
    SPECIAL_TAGS.every((t) => !flat.includes(t)));
check('"New Arrivals" (the phantom category) is not a category',
    !flat.includes("New Arrivals"));

/* ── 3. The schema actually enforces the pairing ── */
console.log("\nSchema enforcement (in-memory documents, nothing saved)\n");

await mongoose.connect(process.env.MONGO_URI);

const base = {
    name: "taxonomy check", description: "x", price: 1, weight: 1,
    variants: [{ color: "C", size: "S", price: 1, stock: 1 }],
};
const errorsFor = async (doc) => {
    const d = new Product(doc);
    try { await d.validate(); return null; } catch (e) { return e; }
};

check("valid pair (Women / Lehengas) passes",
    (await errorsFor({ ...base, gender: "Women", category: "Lehengas" })) === null);

check("valid pair (Kids / Boys) passes",
    (await errorsFor({ ...base, gender: "Kids", category: "Boys" })) === null);

const crossed = await errorsFor({ ...base, gender: "Men", category: "Lehengas" });
check("cross-gender pair (Men / Lehengas) is REJECTED",
    crossed !== null && !!crossed.errors?.category,
    crossed ? "rejected but not on category" : "was accepted");

const oldValue = await errorsFor({ ...base, gender: "Women", category: "Lehangas" });
check("the old misspelling (Women / Lehangas) is REJECTED",
    oldValue !== null && !!oldValue.errors?.category);

const oldKids = await errorsFor({ ...base, gender: "Kids", category: "Kids" });
check("the old flat value (Kids / Kids) is REJECTED", oldKids !== null);

const noGender = await errorsFor({ ...base, category: "Lehengas" });
check("a product with no gender is REJECTED", noGender !== null && !!noGender.errors?.gender);

const pending = await errorsFor({ ...base, needsReclassification: true });
check("a needsReclassification product may omit gender and category",
    pending === null,
    pending ? Object.keys(pending.errors ?? {}).join(",") : "");

const badTag = await errorsFor({ ...base, gender: "Women", category: "Sarees", specialTags: ["Trending"] });
check('specialTags rejects the removed "Trending"', badTag !== null);

const goodTags = await errorsFor({ ...base, gender: "Women", category: "Sarees", specialTags: ["New Arrival", "Sale"] });
check("specialTags accepts multiple valid values", goodTags === null);

const noTags = await errorsFor({ ...base, gender: "Men", category: "Men's Kurta" });
check("specialTags defaults to empty and is optional", noTags === null);

/* Every declared category must actually be constructible. */
let allConstructible = true;
for (const gender of GENDERS) {
    for (const category of CATEGORIES_BY_GENDER[gender]) {
        if (!isValidCategoryForGender(gender, category)) allConstructible = false;
        if ((await errorsFor({ ...base, gender, category })) !== null) allConstructible = false;
    }
}
check("every declared gender/category pair validates", allConstructible);

console.log(`\n${"─".repeat(58)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log("─".repeat(58) + "\n");

await mongoose.disconnect();
process.exit(failed === 0 ? 0 : 1);
