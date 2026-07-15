/**
 * auditImageSizes.js — image-weight regression guard.
 *
 * WHY THIS EXISTS
 * ---------------
 * The homepage once shipped 4–5 MB PNG originals into cards a few hundred
 * pixels wide. Delivery-time Cloudinary transforms fixed that, but nothing
 * stopped a future upload from re-introducing a giant original. This script
 * measures what the store actually stores vs. what a correctly-sized variant
 * would weigh, so the regression is easy to catch before it reaches users.
 *
 * WHAT IT DOES
 *   1. Connects to Mongo and gathers every product image URL
 *      (product.images[] + product.colors[].images[]).
 *   2. HEADs each URL as-stored (the raw original the browser would get with
 *      no transform) and again through a representative card transform
 *      (f_auto,q_auto,c_limit,w_600) with a modern-browser Accept header.
 *   3. Prints total payload before/after, the worst offenders, and a
 *      non-zero exit code if any original exceeds the size budget — so it can
 *      gate CI / a pre-deploy check.
 *
 * USAGE
 *   node src/scripts/auditImageSizes.js
 *   node src/scripts/auditImageSizes.js --budget-kb=800 --top=15 --concurrency=8
 *
 * Requires Node 18+ (global fetch). Read-only: it never writes to the DB.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Products.js";

dotenv.config();

// ---- args -----------------------------------------------------------------
const argv = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v] = a.replace(/^--/, "").split("=");
        return [k, v ?? true];
    })
);
const BUDGET_KB = Number(argv["budget-kb"] || 800); // per-image original ceiling
const TOP = Number(argv.top || 10);
const CONCURRENCY = Number(argv.concurrency || 8);
const CARD_TRANSFORM = "f_auto,q_auto,c_limit,w_600"; // representative delivery size
const BROWSER_ACCEPT = "image/avif,image/webp,image/apng,image/*,*/*";

// ---- helpers --------------------------------------------------------------

// Inline copy of the delivery-URL rewrite (kept dependency-free so the script
// runs standalone). Mirrors frontend/src/utils/cloudinaryImage.js.
const UPLOAD_MARKER = "/image/upload/";
function transformedUrl(url, transform) {
    if (typeof url !== "string" || !url.includes(UPLOAD_MARKER)) return url;
    const idx = url.indexOf(UPLOAD_MARKER);
    const start = idx + UPLOAD_MARKER.length;
    const after = url.slice(start);
    const firstSeg = after.split("/")[0] || "";
    const alreadyTransformed =
        firstSeg.includes(",") || /^[a-z]{1,3}_[^/.]+$/i.test(firstSeg);
    if (alreadyTransformed) return url;
    return `${url.slice(0, start)}${transform}/${after}`;
}

async function measure(url) {
    try {
        let res = await fetch(url, {
            method: "HEAD",
            headers: { Accept: BROWSER_ACCEPT },
        });
        let len = Number(res.headers.get("content-length"));
        // Some derived assets don't report length on HEAD until generated;
        // fall back to a GET (body discarded) to force generation + length.
        if (!res.ok || !len) {
            res = await fetch(url, { headers: { Accept: BROWSER_ACCEPT } });
            const buf = await res.arrayBuffer();
            len = buf.byteLength;
        }
        return {
            ok: res.ok,
            bytes: len || 0,
            type: res.headers.get("content-type") || "?",
        };
    } catch (err) {
        return { ok: false, bytes: 0, type: "error", error: err.message };
    }
}

async function pool(items, size, worker) {
    const results = new Array(items.length);
    let i = 0;
    await Promise.all(
        Array.from({ length: Math.min(size, items.length) }, async () => {
            while (i < items.length) {
                const idx = i++;
                results[idx] = await worker(items[idx], idx);
            }
        })
    );
    return results;
}

const kb = (b) => (b / 1024).toFixed(0);
const mb = (b) => (b / 1048576).toFixed(2);

// ---- main -----------------------------------------------------------------
async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    const products = await Product.find().lean();

    // Collect unique URLs with a label pointing back to the product.
    const seen = new Map(); // url -> { product, field }
    for (const p of products) {
        for (const img of p.images || []) {
            if (img?.url && !seen.has(img.url)) seen.set(img.url, { name: p.name, field: "images" });
        }
        for (const c of p.colors || []) {
            for (const img of c.images || []) {
                if (img?.url && !seen.has(img.url))
                    seen.set(img.url, { name: p.name, field: `color:${c.colorName}` });
            }
        }
    }

    const urls = [...seen.keys()];
    console.log(`Auditing ${urls.length} unique image URLs across ${products.length} products…`);
    console.log(`(original as-stored  vs  delivery transform "${CARD_TRANSFORM}")\n`);

    const rows = await pool(urls, CONCURRENCY, async (url) => {
        const [orig, opt] = await Promise.all([
            measure(url),
            measure(transformedUrl(url, CARD_TRANSFORM)),
        ]);
        return { url, meta: seen.get(url), orig, opt };
    });

    const totalOrig = rows.reduce((s, r) => s + r.orig.bytes, 0);
    const totalOpt = rows.reduce((s, r) => s + r.opt.bytes, 0);
    const overBudget = rows
        .filter((r) => r.orig.bytes > BUDGET_KB * 1024)
        .sort((a, b) => b.orig.bytes - a.orig.bytes);

    // Worst offenders by original size.
    const worst = [...rows].sort((a, b) => b.orig.bytes - a.orig.bytes).slice(0, TOP);

    console.log(`── Top ${worst.length} heaviest originals ──`);
    for (const r of worst) {
        console.log(
            `  ${kb(r.orig.bytes).padStart(6)} KB  ${r.orig.type.padEnd(10)} → ` +
                `${kb(r.opt.bytes).padStart(5)} KB ${r.opt.type.padEnd(10)}  ${r.meta?.name || "?"} (${r.meta?.field})`
        );
    }

    const saved = totalOrig - totalOpt;
    const pct = totalOrig ? ((saved / totalOrig) * 100).toFixed(1) : "0";
    console.log("\n── Totals ──");
    console.log(`  Images audited      : ${rows.length}`);
    console.log(`  Original payload    : ${mb(totalOrig)} MB`);
    console.log(`  Optimized payload   : ${mb(totalOpt)} MB  (card-sized variant)`);
    console.log(`  Would save          : ${mb(saved)} MB  (${pct}%)`);
    console.log(`  Over ${BUDGET_KB} KB budget   : ${overBudget.length} image(s)`);

    if (overBudget.length) {
        console.log(
            `\n⚠️  ${overBudget.length} original(s) exceed the ${BUDGET_KB} KB budget. ` +
                `Delivery transforms shield users, but consider re-checking upload settings.`
        );
    }

    await mongoose.disconnect();
    // Non-zero exit when over budget so this can gate a CI/pre-deploy step.
    process.exit(overBudget.length > 0 ? 1 : 0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
