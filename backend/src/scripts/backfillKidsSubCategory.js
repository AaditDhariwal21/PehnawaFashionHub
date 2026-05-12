/**
 * One-shot migration: introduce Kids subcategories.
 *
 * Handles two starting states:
 *   1. Products with category === "Kidswear"  (the legacy label).
 *      → category = "Kids", subCategory = "Girls".
 *   2. Products with category === "Kids" but no subCategory.
 *      → subCategory = "Girls".
 *
 * Run with:
 *   node src/scripts/backfillKidsSubCategory.js
 *
 * Idempotent: products already on category="Kids" with a valid
 * subCategory are skipped, so the script is safe to re-run.
 *
 * categorySlug is updated alongside the category rename. This is a
 * deliberate exception to the "slug never changes" policy — slugs
 * stay stable across automatic renames, but a one-time category
 * restructuring is an explicit, deliberate change.
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/Products.js";

const run = async () => {
    await connectDB();

    // Pass 1 — rename legacy "Kidswear" to "Kids" and assign subCategory.
    const legacy = await Product.find({ category: /^kidswear$/i });
    console.log(`Found ${legacy.length} product(s) on legacy category "Kidswear".`);
    for (const product of legacy) {
        product.category = "Kids";
        product.categorySlug = "kids";
        if (!product.subCategory) product.subCategory = "Girls";
        await product.save();
        console.log(`  ✓ ${product.name} → Kids / ${product.subCategory}`);
    }

    // Pass 2 — fill in subCategory for any Kids product still missing it.
    const missing = await Product.find({
        category: "Kids",
        $or: [
            { subCategory: { $exists: false } },
            { subCategory: null },
            { subCategory: "" },
        ],
    });
    console.log(`Found ${missing.length} Kids product(s) needing subCategory.`);
    for (const product of missing) {
        product.subCategory = "Girls";
        await product.save();
        console.log(`  ✓ ${product.name} → Kids / Girls`);
    }

    // Pass 3 — defensively null out subCategory on non-Kids records.
    // Cheap guardrail in case a previous bug leaked the field elsewhere.
    const stray = await Product.updateMany(
        { category: { $ne: "Kids" }, subCategory: { $ne: null } },
        { $set: { subCategory: null } }
    );
    if (stray.modifiedCount > 0) {
        console.log(`Cleared stray subCategory on ${stray.modifiedCount} non-Kids product(s).`);
    }

    console.log("\nDone.");
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
