/**
 * Migrate products from the flat `category` string to the gender + category
 * taxonomy, and from single `specialTag` to multi-value `specialTags`.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless --commit is passed.
 *
 *   Dry run against .env (dev):      node src/scripts/migrateProductTaxonomy.js
 *   Dry run against production:      node src/scripts/migrateProductTaxonomy.js --uri="mongodb+srv://…"
 *   Actually write (dev):            node src/scripts/migrateProductTaxonomy.js --commit
 *   Actually write (production):     node src/scripts/migrateProductTaxonomy.js --uri="…" --commit
 *
 * The database name is printed on connect. --uri bypasses .env entirely so a
 * production run cannot silently fall through to dev.
 *
 * ── Guarantees ──
 *
 * IDEMPOTENT. Re-running is safe: an already-migrated product is detected by
 * having a valid gender + category pair and is reported as "already compliant"
 * rather than touched again.
 *
 * NO SILENT DATA LOSS. Exactly one automatic remap is applied — Pashminas →
 * Dupattas (gender Women, since that is unambiguous). Everything that is not a
 * clean 1:1 match goes to the manual-review list with gender and category left
 * UNSET and needsReclassification: true, so it is findable with a single query
 * and cannot masquerade as correctly classified. No heuristics guess a gender.
 *
 * BACKED UP. A --commit run first copies the entire products collection to a
 * timestamped `products_backup_<ts>` collection in the same database, and
 * refuses to proceed if that copy fails or comes out the wrong size.
 *
 * ── Decisions encoded here (confirmed with the product owner) ──
 *
 *  · Kids + subCategory "Boys"  → gender Kids, category Boys. Trustworthy: the
 *    old pre-save hook defaulted to "Girls", so "Boys" could only have been set
 *    deliberately.
 *  · Kids + subCategory "Girls" → MANUAL REVIEW. Untrustworthy: "Girls" is also
 *    what the old hook and backfillKidsSubCategory.js wrote when nothing was
 *    specified, so it cannot be distinguished from an admin's real choice.
 *  · Kids + no subCategory      → MANUAL REVIEW.
 *  · "Lehangas" → "Lehengas". A misspelling that reached customer-facing URLs;
 *    categorySlug is corrected too (old links still resolve — getProductBySlug
 *    matches on the product slug and uses categorySlug only to trigger a
 *    redirect).
 *  · specialTag "Trending" → NO tag. Removed from the taxonomy entirely.
 *  · specialTag "Best Seller" → "Bestseller" (one word, per the new enum).
 *
 * PromoCode.categories stores denormalised category strings compared by exact
 * Array.includes, so it is migrated in the same run — otherwise a promo scoped
 * to a renamed category silently stops discounting anything, with no error.
 */

import mongoose from "mongoose";
import {
    CATEGORIES_BY_GENDER,
    genderForCategory,
    isValidCategoryForGender,
} from "../config/productTaxonomy.js";

/* ── Connection ── */
const uriArg = process.argv.find((a) => a.startsWith("--uri="));
const explicitUri = uriArg ? uriArg.slice("--uri=".length) : null;
const COMMIT = process.argv.includes("--commit");

if (!explicitUri) {
    const dotenv = await import("dotenv");
    dotenv.default.config({ quiet: true });
}
const uri = explicitUri || process.env.MONGO_URI;
if (!uri) {
    console.error("No connection string. Pass --uri=… or set MONGO_URI in .env.");
    process.exit(1);
}

/* ══════════════════════════════════════════════════════════════
   Mapping rules
   ══════════════════════════════════════════════════════════════ */

/** Straight 1:1 renames of the category value itself. */
const CATEGORY_RENAMES = {
    Lehangas: "Lehengas",   // misspelling that reached customer-facing URLs
    Pashminas: "Dupattas",  // the one explicit merge
};

const TAG_MAP = {
    "New Arrival": "New Arrival",
    "Best Seller": "Bestseller",
    Bestseller: "Bestseller",
    Sale: "Sale",
    Trending: null,          // removed from the taxonomy — product keeps no tag
    "": null,
};

/**
 * Decide what a single product should become.
 * @returns {{action, gender?, category?, categorySlug?, specialTags, reason}}
 */
const planProduct = (p) => {
    const specialTags = [];
    let droppedTag = null;
    if (p.specialTag) {
        const mapped = Object.prototype.hasOwnProperty.call(TAG_MAP, p.specialTag)
            ? TAG_MAP[p.specialTag]
            : undefined;
        if (mapped) specialTags.push(mapped);
        else if (mapped === null) droppedTag = p.specialTag;
        else droppedTag = p.specialTag; // unknown value — report it, don't invent
    }

    /* Already migrated? */
    if (p.gender && p.category && isValidCategoryForGender(p.gender, p.category)) {
        return { action: "compliant", specialTags, droppedTag };
    }

    const raw = (p.category ?? "").trim();

    /* Kids is the only case where the old schema split into two new categories,
       and only one of the two stored values can be trusted. */
    if (/^kids(wear)?$/i.test(raw)) {
        if (p.subCategory === "Boys") {
            return {
                action: "auto", gender: "Kids", category: "Boys",
                specialTags, droppedTag,
                reason: 'subCategory "Boys" was explicitly set (the old default was "Girls")',
            };
        }
        return {
            action: "manual", specialTags, droppedTag,
            reason: p.subCategory === "Girls"
                ? 'subCategory "Girls" is indistinguishable from the old automatic default — needs a human decision'
                : `Kids product with no subCategory (${JSON.stringify(p.subCategory ?? null)}) — Boys/Girls unknown`,
        };
    }

    const renamed = CATEGORY_RENAMES[raw] ?? raw;
    const gender = genderForCategory(renamed);

    if (gender) {
        const plan = {
            action: "auto", gender, category: renamed,
            specialTags, droppedTag,
            reason: renamed === raw
                ? "1:1 match"
                : `renamed "${raw}" → "${renamed}"`,
        };
        /* Correct the slug only for the spelling fix, and only when it still
           reflects the misspelling. Kids slugs are deliberately left alone. */
        if (raw === "Lehangas" && p.categorySlug === "lehangas") {
            plan.categorySlug = "lehengas";
        }
        return plan;
    }

    return {
        action: "manual", specialTags, droppedTag,
        reason: raw ? `"${raw}" is not in the new taxonomy` : "no category value at all",
    };
};

/* ══════════════════════════════════════════════════════════════ */

const money = (n) => String(n).padStart(4);

await mongoose.connect(uri);
const db = mongoose.connection.db;
const products = db.collection("products");
const promoCodes = db.collection("promocodes");

console.log(`\n${"=".repeat(76)}`);
console.log(`Database : ${db.databaseName}`);
console.log(`Mode     : ${COMMIT ? "*** COMMIT (will write) ***" : "DRY RUN (no writes)"}`);
console.log("=".repeat(76));

const all = await products
    .find({})
    .project({
        name: 1, category: 1, subCategory: 1, specialTag: 1, gender: 1,
        specialTags: 1, categorySlug: 1, slug: 1, needsReclassification: 1,
        "images.url": 1,
    })
    .sort({ category: 1, name: 1 })
    .toArray();

const plans = all.map((p) => ({ product: p, plan: planProduct(p) }));
const auto = plans.filter((x) => x.plan.action === "auto");
const manual = plans.filter((x) => x.plan.action === "manual");
const compliant = plans.filter((x) => x.plan.action === "compliant");
const droppedTags = plans.filter((x) => x.plan.droppedTag);

/* ── Report: automatic migrations ── */
console.log(`\n── AUTO-MIGRATE (${auto.length}) ──\n`);
if (auto.length === 0) console.log("  (none)");
for (const { product, plan } of auto) {
    console.log(`  ${product._id}`);
    console.log(`     ${String(product.category)}${product.subCategory ? `/${product.subCategory}` : ""}  →  gender=${plan.gender}  category=${plan.category}`);
    if (plan.categorySlug) console.log(`     categorySlug: "${product.categorySlug}" → "${plan.categorySlug}"`);
    console.log(`     specialTag ${JSON.stringify(product.specialTag ?? null)} → specialTags ${JSON.stringify(plan.specialTags)}`);
    console.log(`     why: ${plan.reason}`);
    console.log(`     ${String(product.name).slice(0, 66)}`);
}

/* ── Report: manual review ── */
console.log(`\n── NEEDS MANUAL CLASSIFICATION (${manual.length}) ──\n`);
if (manual.length === 0) {
    console.log("  (none — every product mapped unambiguously)");
} else {
    console.log("  These will be marked needsReclassification:true with gender and");
    console.log("  category left UNSET. Find them later with:");
    console.log("      db.products.find({ needsReclassification: true })\n");
    for (const { product, plan } of manual) {
        console.log(`  ${product._id}`);
        console.log(`     name     : ${product.name}`);
        console.log(`     current  : category=${JSON.stringify(product.category)} subCategory=${JSON.stringify(product.subCategory ?? null)}`);
        console.log(`     slug     : ${product.slug ?? "—"}`);
        console.log(`     image    : ${product.images?.[0]?.url ?? "—"}`);
        console.log(`     why      : ${plan.reason}`);
        console.log("");
    }
}

/* ── Report: tags being dropped ── */
console.log(`── SPECIAL TAGS BEING DROPPED (${droppedTags.length}) ──\n`);
if (droppedTags.length === 0) console.log("  (none)");
for (const { product, plan } of droppedTags) {
    console.log(`  ${product._id}  "${plan.droppedTag}" → no tag   ${String(product.name).slice(0, 50)}`);
}

/* ── Report: promo codes ── */
const promos = await promoCodes.find({}).project({ code: 1, categories: 1 }).toArray();
const promoPlans = [];
for (const promo of promos) {
    const current = promo.categories ?? [];
    if (current.length === 0) continue;
    const next = [];
    for (const c of current) {
        if (/^kids(wear)?$/i.test(c)) next.push("Boys", "Girls");
        else next.push(CATEGORY_RENAMES[c] ?? c);
    }
    const deduped = [...new Set(next)];
    if (JSON.stringify(deduped) !== JSON.stringify(current)) {
        promoPlans.push({ promo, next: deduped });
    }
}

console.log(`\n── PROMO CODE SCOPES TO REWRITE (${promoPlans.length} of ${promos.length} codes) ──\n`);
if (promoPlans.length === 0) {
    console.log("  (none)");
} else {
    for (const { promo, next } of promoPlans) {
        console.log(`  ${promo.code}: ${JSON.stringify(promo.categories)} → ${JSON.stringify(next)}`);
    }
}

/* ── Summary ── */
console.log(`\n${"=".repeat(76)}`);
console.log("SUMMARY");
console.log("-".repeat(76));
console.log(`  Total products                : ${money(all.length)}`);
console.log(`  Already compliant (re-run)    : ${money(compliant.length)}`);
console.log(`  Will auto-migrate             : ${money(auto.length)}`);
console.log(`  Need manual classification    : ${money(manual.length)}`);
console.log(`  Special tags dropped          : ${money(droppedTags.length)}`);
console.log(`  Promo code scopes rewritten   : ${money(promoPlans.length)}`);
console.log("-".repeat(76));

const byGender = {};
for (const { plan } of auto) byGender[plan.gender] = (byGender[plan.gender] ?? 0) + 1;
for (const g of Object.keys(CATEGORIES_BY_GENDER)) {
    console.log(`  → gender ${g.padEnd(6)}             : ${money(byGender[g] ?? 0)}`);
}
console.log("=".repeat(76));

if (!COMMIT) {
    console.log("\nDRY RUN — nothing was written. Re-run with --commit to apply.\n");
    await mongoose.disconnect();
    process.exit(0);
}

/* ══════════════════════════════════════════════════════════════
   COMMIT PATH
   ══════════════════════════════════════════════════════════════ */

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupName = `products_backup_${stamp}`;

console.log(`\nBacking up products → ${backupName} …`);
await products.aggregate([{ $match: {} }, { $out: backupName }]).toArray();
const backupCount = await db.collection(backupName).countDocuments({});
if (backupCount !== all.length) {
    console.error(`ABORT: backup holds ${backupCount} documents but products has ${all.length}. Nothing was modified.`);
    await mongoose.disconnect();
    process.exit(1);
}
console.log(`Backup verified: ${backupCount} documents.\n`);

let migrated = 0;
let flagged = 0;

for (const { product, plan } of plans) {
    if (plan.action === "compliant") continue;

    if (plan.action === "auto") {
        const $set = {
            gender: plan.gender,
            category: plan.category,
            specialTags: plan.specialTags,
            needsReclassification: false,
        };
        if (plan.categorySlug) $set.categorySlug = plan.categorySlug;
        await products.updateOne({ _id: product._id }, { $set });
        migrated += 1;
    } else {
        /* Leave gender/category UNSET rather than guessing — the flag is what
           makes these findable, and an absent value can't be mistaken for a
           real classification. */
        await products.updateOne(
            { _id: product._id },
            {
                $set: { needsReclassification: true, specialTags: plan.specialTags },
                $unset: { gender: "", category: "" },
            }
        );
        flagged += 1;
    }
}

for (const { promo, next } of promoPlans) {
    await promoCodes.updateOne({ _id: promo._id }, { $set: { categories: next } });
}

console.log(`Committed: ${migrated} migrated, ${flagged} flagged for manual review, ${promoPlans.length} promo scopes rewritten.`);
console.log(`Backup collection: ${backupName}`);
console.log(`\nOutstanding manual work: db.products.find({ needsReclassification: true })\n`);

await mongoose.disconnect();
process.exit(0);
