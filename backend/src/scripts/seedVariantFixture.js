/**
 * Seed the fixture the variant-editor E2E check needs: an admin user and one
 * product with 2 colors × 2 sizes, all four variants populated.
 *
 * Run with:
 *   MONGO_URI=mongodb://127.0.0.1:27017/pehnawa_dev node src/scripts/seedVariantFixture.js
 *
 * Then:  node ../frontend/e2e/variant-editor.mjs
 *
 * Refuses to run against anything but a localhost MONGO_URI. The E2E check
 * mutates and deletes variants, so it must never be pointed at a shared or
 * production database — the guard below is what makes that a mechanical
 * guarantee rather than a note in a README.
 */

import dotenv from "dotenv";
dotenv.config({ quiet: true });

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/Users.js";
import Product from "../models/Products.js";

const PRODUCT_NAME = "Variant Test Kurta";
const ADMIN_EMAIL = "admin@local.test";
const ADMIN_PASSWORD = "LocalAdmin123!";

const uri = process.env.MONGO_URI;
if (!uri) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
}
if (!/@?(localhost|127\.0\.0\.1)[:/]/.test(uri)) {
    console.error(
        `Refusing to seed a non-local database.\n  MONGO_URI=${uri}\n` +
        "Point MONGO_URI at a local mongod before running this script."
    );
    process.exit(1);
}

const img = (n) => ({
    url: `https://res.cloudinary.com/demo/image/upload/sample${n}.jpg`,
    publicId: `sample${n}`,
});

await mongoose.connect(uri);

/* Idempotent: replace the fixture rather than accumulating copies. */
await User.deleteOne({ email: ADMIN_EMAIL });
await Product.deleteMany({ name: PRODUCT_NAME });

await User.create({
    name: "Local Admin",
    email: ADMIN_EMAIL,
    password: await bcrypt.hash(ADMIN_PASSWORD, 10),
    role: "admin",
});

const product = await Product.create({
    name: PRODUCT_NAME,
    shortDescription: "Two colors, two sizes.",
    description: "<p>Seeded for the variant-editor regression check.</p>",
    price: 99,
    gender: "Men",
    category: "Men's Kurta",
    weight: 1.5,
    images: [img(1)],
    colors: [
        { colorName: "Red", images: [img(1)] },
        { colorName: "Blue", images: [img(2)] },
    ],
    variants: [
        { color: "Red", size: "S", price: 50, stock: 5 },
        { color: "Red", size: "M", price: 55, stock: 6 },
        { color: "Blue", size: "S", price: 60, stock: 7 },
        { color: "Blue", size: "M", price: 65, stock: 8 },
    ],
});

console.log(`Seeded admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
console.log(`Seeded product "${product.name}" (${product._id})`);

await mongoose.disconnect();
