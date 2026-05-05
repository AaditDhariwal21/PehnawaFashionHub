/**
 * One-shot migration: backfill slug and categorySlug on every product
 * that doesn't have them yet.
 *
 * Run with:
 *   node src/scripts/backfillSlugs.js
 *
 * Idempotent — products that already have slugs are skipped, so it's
 * safe to re-run if the script is interrupted.
 *
 * The script does NOT recompute slugs for products that already have
 * one. Slug stability is a contract; once assigned, it doesn't change.
 */

import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/Products.js";
import { generateSlug, ensureUniqueSlug } from "../utils/slug.js";

const run = async () => {
    await connectDB();

    const products = await Product.find({
        $or: [
            { slug: { $exists: false } },
            { slug: null },
            { slug: "" },
            { categorySlug: { $exists: false } },
            { categorySlug: null },
            { categorySlug: "" },
        ],
    });

    console.log(`Found ${products.length} product(s) needing backfill.`);

    let filled = 0;
    for (const product of products) {
        let dirty = false;

        if (!product.slug) {
            const base = generateSlug(product.name);
            product.slug = await ensureUniqueSlug(Product, base, product._id);
            dirty = true;
        }
        if (!product.categorySlug) {
            product.categorySlug = generateSlug(product.category);
            dirty = true;
        }

        if (dirty) {
            await product.save();
            filled++;
            console.log(`  ✓ ${product.name} → /${product.categorySlug}/${product.slug}`);
        }
    }

    console.log(`\nDone. Backfilled ${filled} product(s).`);
    await mongoose.disconnect();
};

run().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
