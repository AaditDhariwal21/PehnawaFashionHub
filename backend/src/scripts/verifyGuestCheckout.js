/**
 * End-to-end verification for guest checkout, the saved cart, and the
 * checkout security fixes, run against a LOCAL server, the DEVELOPMENT
 * database and the Square SANDBOX.
 *
 * Run with (two terminals):
 *
 *   # 1. the server, with guest checkout on and a local-only webhook key
 *   GUEST_CHECKOUT_ENABLED=true \
 *   SQUARE_WEBHOOK_SIGNATURE_KEY=<any-test-key> \
 *   SQUARE_WEBHOOK_URL=http://localhost:5000/api/webhooks/square \
 *   PENDING_ORDER_SWEEPER_ENABLED=false TRUST_PROXY_HOPS=1 \
 *   node src/index.js
 *
 *   # 2. this script, with the same key
 *   E2E_WEBHOOK_KEY=<same-test-key> node src/scripts/verifyGuestCheckout.js
 *
 *   Options:  --seed-only   create the fixtures and exit (for the browser E2E)
 *             --cleanup     delete every fixture and exit
 *
 * WHAT IS REAL: every HTTP call goes through the real server; payments are real
 * Square SANDBOX payments, made by driving Square's sandbox testing panel with
 * Playwright (installed in ../frontend); orders, stock, carts and promo
 * redemptions are real documents in the dev database.
 *
 * SAFETY: refuses to run unless the database name is exactly "pehnawa_dev",
 * SQUARE_ENVIRONMENT is "sandbox", and the API base is localhost. Every
 * fixture is tagged ([E2E-GUEST] products, @e2e-guest.test users/emails, E2EG*
 * promo codes) and removed at the end, including on failure.
 *
 * Rate limits: each request carries its own X-Forwarded-For address (the
 * server trusts one proxy hop), so tests don't trip each other's limits; the
 * rate-limit section reuses one address on purpose.
 */

import "dotenv/config";

import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

import User from "../models/Users.js";
import Product from "../models/Products.js";
import Order from "../models/Order.js";
import PendingOrder from "../models/PendingOrder.js";
import PromoCode from "../models/PromoCode.js";
import PromoRedemption from "../models/PromoRedemption.js";
import Cart from "../models/Cart.js";

/* ── Guards ─────────────────────────────────────────────────── */

const API = process.env.E2E_API_BASE || "http://localhost:5000/api";
const WEBHOOK_URL = process.env.E2E_WEBHOOK_URL || "http://localhost:5000/api/webhooks/square";
const WEBHOOK_KEY = process.env.E2E_WEBHOOK_KEY || "";

const dbName = (process.env.MONGO_URI || "").match(/\.net\/([^?]*)|:\d+\/([^?]*)/)?.slice(1).find(Boolean);
const dbHost = (process.env.MONGO_URI || "").match(/\/\/(?:[^@]*@)?([^/?]+)/)?.[1];

console.log(`Database: ${dbHost} / ${dbName}`);
console.log(`Square:   ${process.env.SQUARE_ENVIRONMENT}`);
console.log(`API:      ${API}`);

if (dbName !== "pehnawa_dev") {
    console.error("Refusing to run: database is not pehnawa_dev.");
    process.exit(1);
}
if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
    console.error("Refusing to run: SQUARE_ENVIRONMENT is not sandbox.");
    process.exit(1);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(API)) {
    console.error("Refusing to run: API base is not localhost.");
    process.exit(1);
}

const args = new Set(process.argv.slice(2));

/* ── Harness (same shape as the other verify scripts) ───────── */

let passed = 0;
let failed = 0;
const failures = [];

const check = (name, condition, detail = "") => {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${name}`);
    } else {
        failed += 1;
        failures.push(name);
        console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`);
    }
};

const section = (title) => console.log(`\n── ${title} ──`);

/* ── Fixtures ───────────────────────────────────────────────── */

const TAG = "[E2E-GUEST]";
const EMAIL_DOMAIN = "e2e-guest.test";
const PASSWORD = "E2eGuest!Pass123";
const img = (n) => ({ url: `https://res.cloudinary.com/demo/image/upload/sample${n}.jpg`, publicId: `sample${n}` });

const ADDRESS = {
    fullName: "José Ñandú 🌸",
    phone: "+1 (202) 456-1111",
    addressLine1: "1600 Pennsylvania Ave NW",
    addressLine2: "",
    city: "Washington",
    state: "DC",
    zipCode: "20500",
    country: "United States",
};

const cleanup = async () => {
    const products = await Product.find({ name: { $regex: `^\\[E2E-GUEST\\]` } }).select("_id").lean();
    const productIds = products.map((p) => p._id);
    const users = await User.find({ email: { $regex: `@${EMAIL_DOMAIN.replace(".", "\\.")}$` } }).select("_id").lean();
    const userIds = users.map((u) => u._id);
    const promos = await PromoCode.find({ code: { $regex: "^E2EG" } }).select("_id").lean();
    const promoIds = promos.map((p) => p._id);

    const res = {
        orders: await Order.deleteMany({
            $or: [
                { "items.productId": { $in: productIds } },
                { contactEmail: { $regex: `@${EMAIL_DOMAIN.replace(".", "\\.")}$` } },
                { user: { $in: userIds } },
            ],
        }),
        pending: await PendingOrder.deleteMany({
            $or: [{ "cartItems.productId": { $in: productIds } }, { userId: { $in: userIds } }],
        }),
        redemptions: await PromoRedemption.deleteMany({ promoCode: { $in: promoIds } }),
        promos: await PromoCode.deleteMany({ _id: { $in: promoIds } }),
        carts: await Cart.deleteMany({ user: { $in: userIds } }),
        users: await User.deleteMany({ _id: { $in: userIds } }),
        products: await Product.deleteMany({ _id: { $in: productIds } }),
    };
    return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.deletedCount]));
};

const seed = async () => {
    await cleanup();

    const kurta = await Product.create({
        name: `${TAG} Test Kurta`,
        shortDescription: "Guest checkout fixture.",
        description: "<p>Seeded by verifyGuestCheckout.js</p>",
        price: 50,
        gender: "Men",
        category: "Men's Kurta",
        weight: 1,
        images: [img(1)],
        colors: [{ colorName: "Red", images: [img(1)] }, { colorName: "Blue", images: [img(2)] }],
        variants: [
            { color: "Red", size: "S", price: 50, stock: 40 },
            { color: "Red", size: "M", price: 55, stock: 1 }, // the "last item"
            { color: "Blue", size: "S", price: 60, stock: 0 }, // sold out
        ],
    });

    const mkUser = async (local, role = "user") => User.create({
        name: `E2E ${local}`,
        email: `${local}@${EMAIL_DOMAIN}`,
        password: await bcrypt.hash(PASSWORD, 10),
        role,
    });

    const userA = await mkUser("alice");
    const userB = await mkUser("bob");
    const admin = await mkUser("admin", "admin");

    const now = Date.now();
    const promo10 = await PromoCode.create({
        code: "E2EG10", description: `${TAG}`, discountType: "PERCENTAGE", discountValue: 10,
        validFrom: new Date(now - 86400000), validTill: new Date(now + 86400000 * 7), perUserUsageLimit: 1,
    });
    const promoFirst = await PromoCode.create({
        code: "E2EGFIRST", description: `${TAG}`, discountType: "FLAT", discountValue: 5,
        validFrom: new Date(now - 86400000), validTill: new Date(now + 86400000 * 7), perUserUsageLimit: 5, firstOrderOnly: true,
    });

    return { kurta, userA, userB, admin, promo10, promoFirst };
};

/* ── HTTP helpers ───────────────────────────────────────────── */

let ipSeq = 1;
const freshIp = () => {
    ipSeq += 1;
    return `10.${Math.floor(ipSeq / 65000) % 250}.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`;
};

const call = async (method, p, { body, token, ip, rawBody } = {}) => {
    const headers = { "X-Forwarded-For": ip || freshIp() };
    if (body !== undefined || rawBody !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(API + p, {
        method,
        headers,
        body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, data };
};

const login = async (email) => {
    const r = await call("POST", "/auth/login", { body: { email, password: PASSWORD } });
    if (!r.data?.token) throw new Error(`login failed for ${email}: ${JSON.stringify(r.data)}`);
    return r.data.token;
};

const lineOf = (product, color, size, quantity = 1) => ({ productId: product._id.toString(), color, size, quantity });

const guestCheckout = (body, opts = {}) => call("POST", "/payments/guest/create-checkout", { body, ...opts });

const sendWebhook = async (squareOrderId, { sign = true, key = WEBHOOK_KEY, status = "COMPLETED" } = {}) => {
    const body = JSON.stringify({
        type: "payment.updated",
        event_id: crypto.randomUUID(),
        data: { object: { payment: { id: `FORGED-${crypto.randomUUID()}`, order_id: squareOrderId, status } } },
    });
    const sig = sign ? crypto.createHmac("sha256", key).update(WEBHOOK_URL + body).digest("base64") : "";
    const res = await fetch(`${API}/webhooks/square`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-square-hmacsha256-signature": sig },
        body,
    });
    return res.status;
};

const stockOf = async (productId, color, size) => {
    const p = await Product.findById(productId).lean();
    return p.variants.find((v) => v.color === color && v.size === size)?.stock;
};

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

/* ── Paying in the Square sandbox ──────────────────────────────
   A payment link's order can't be paid through the Payments API
   (Square: "The order must be OPEN to be paid"), and the sandbox
   link opens Square's testing panel instead of a card form. The
   panel's "Test Payment" makes a real sandbox payment against the
   order — exactly what a customer's payment does in production. */

let browser = null;
const pay = async (checkoutUrl) => {
    if (!browser) {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const req = createRequire(path.resolve(here, "../../../frontend/package.json"));
        const { chromium } = req("playwright");
        browser = await chromium.launch();
    }
    const page = await browser.newPage();
    try {
        await page.goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.getByRole("button", { name: "Next" }).click({ timeout: 30000 });
        await page.getByRole("button", { name: "Test Payment" }).click({ timeout: 30000 });
        await page.getByText("Checkout Complete", { exact: false }).last().waitFor({ timeout: 30000 });
        await page.getByText("successful", { exact: false }).first().waitFor({ timeout: 30000 });
    } finally {
        await page.close();
    }
};

/** Fields that must never appear in a response to a guest. */
const FORBIDDEN_GUEST_KEYS = ["_id", "user", "paymentResult", "stockApplied", "stockAppliedAt", "stockIssues", "fulfillmentHold", "guest", "accessTokenHash", "__v", "promo"];
const leakedKeys = (obj) => {
    const found = [];
    const walk = (o, p) => {
        if (!o || typeof o !== "object") return;
        for (const [k, v] of Object.entries(o)) {
            if (FORBIDDEN_GUEST_KEYS.includes(k)) found.push(`${p}${k}`);
            walk(v, `${p}${k}.`);
        }
    };
    walk(obj, "");
    return found;
};

/* ══════════════════════════════════════════════════════════════ */

await mongoose.connect(process.env.MONGO_URI);

if (args.has("--cleanup")) {
    console.log("Removed:", await cleanup());
    await mongoose.disconnect();
    process.exit(0);
}

const fx = await seed();
console.log(`Seeded product ${fx.kurta._id}, users ${fx.userA.email} / ${fx.userB.email} / ${fx.admin.email}`);

if (args.has("--seed-only")) {
    console.log(JSON.stringify({ productId: fx.kurta._id, slug: fx.kurta.slug, categorySlug: fx.kurta.categorySlug, userEmail: fx.userA.email, password: PASSWORD }));
    await mongoose.disconnect();
    process.exit(0);
}

try {
    if (!WEBHOOK_KEY) throw new Error("E2E_WEBHOOK_KEY must match the server's SQUARE_WEBHOOK_SIGNATURE_KEY");

    const tokenA = await login(fx.userA.email);
    const tokenB = await login(fx.userB.email);
    const tokenAdmin = await login(fx.admin.email);
    const K = fx.kurta;
    const redS = (q = 1) => lineOf(K, "Red", "S", q);

    /* ─────────────────────────────────────────────────────────── */
    section("1. Guest create-checkout — input validation & injection");

    /* A fresh email per request, so the per-email checkout limit (10/hour)
       never interferes with the checks that aren't about it. */
    let emailSeq = 0;
    const base = (over = {}) => ({
        email: `val${(emailSeq += 1)}@${EMAIL_DOMAIN}`,
        cartItems: [redS(1)],
        shippingAddress: { ...ADDRESS },
        ...over,
    });

    const expect400 = async (name, body) => {
        const r = await guestCheckout(body);
        check(name, r.status === 400 && r.data?.success === false && !r.data?.checkoutUrl, `got ${r.status} ${JSON.stringify(r.data)?.slice(0, 160)}`);
        return r;
    };

    let r = await expect400("missing email → 400", base({ email: undefined }));
    check("…and names the email field", r.data?.field === "email");
    await expect400("malformed email → 400", base({ email: "not-an-email" }));
    await expect400("email as {$ne:null} operator → 400", base({ email: { $ne: null } }));
    await expect400("email with <script> → 400", base({ email: "<script>@x.test" }));
    await expect400("300-char email → 400", base({ email: `${"a".repeat(290)}@x.test` }));
    await expect400("empty cart → 400", base({ cartItems: [] }));
    await expect400("cartItems not an array → 400", base({ cartItems: { 0: redS() } }));
    for (const q of [0, -1, 1.5, 21, 1e9, "2", null]) {
        await expect400(`quantity ${JSON.stringify(q)} → 400`, base({ cartItems: [{ ...redS(), quantity: q }] }));
    }
    await expect400("productId {$ne:null} → 400", base({ cartItems: [{ ...redS(), productId: { $ne: null } }] }));
    await expect400("productId not an ObjectId → 400", base({ cartItems: [{ ...redS(), productId: "abc" }] }));
    await expect400("51 cart lines → 400", base({ cartItems: Array.from({ length: 51 }, () => redS()) }));
    await expect400("duplicate cart line → 400", base({ cartItems: [redS(), redS()] }));
    await expect400("fullName as object → 400", base({ shippingAddress: { ...ADDRESS, fullName: { $gt: "" } } }));
    await expect400("fullName with <script> → 400", base({ shippingAddress: { ...ADDRESS, fullName: "<script>alert(1)</script>" } }));
    await expect400("addressLine1 of 5000 chars → 400", base({ shippingAddress: { ...ADDRESS, addressLine1: "x".repeat(5000) } }));
    await expect400("phone with letters → 400", base({ shippingAddress: { ...ADDRESS, phone: "call me maybe" } }));
    await expect400("unsupported country → 400", base({ shippingAddress: { ...ADDRESS, country: "Narnia" } }));
    await expect400("promoCode as object → 400", base({ promoCode: { $ne: null } }));
    await expect400("checkoutAttemptId not a UUID → 400", base({ checkoutAttemptId: "1234" }));

    r = await guestCheckout(base({ cartItems: [lineOf(K, "Blue", "S", 1)] }));
    check("sold-out variant → 400 INSUFFICIENT_STOCK", r.status === 400 && r.data?.code === "INSUFFICIENT_STOCK", JSON.stringify(r.data));
    r = await guestCheckout(base({ cartItems: [redS(21 - 1)].map((l) => ({ ...l, quantity: 20 })), }));
    check("quantity 20 (max) accepted when in stock", r.status === 200 && r.data?.success, JSON.stringify(r.data)?.slice(0, 200));
    r = await guestCheckout(base({ cartItems: [lineOf(K, "Green", "XL", 1)] }));
    check("non-existent variant → 400", r.status === 400, JSON.stringify(r.data));
    r = await guestCheckout(base({ cartItems: [lineOf({ _id: new mongoose.Types.ObjectId() }, "Red", "S", 1)] }));
    check("non-existent product → 404 without leaking the id", r.status === 404 && !JSON.stringify(r.data).includes("ObjectId"), JSON.stringify(r.data));

    const malformed = await call("POST", "/payments/guest/create-checkout", { rawBody: "{not json" });
    check("malformed JSON → 400 with a generic message, no internal error text",
        malformed.status === 400 && malformed.data?.message === "Invalid request." && !("error" in (malformed.data || {})),
        JSON.stringify(malformed.data));

    /* ─────────────────────────────────────────────────────────── */
    section("2. Server-side pricing — client money fields are ignored");

    r = await guestCheckout(base({
        email: `price@${EMAIL_DOMAIN}`,
        cartItems: [{ ...redS(2), price: 0.01 }],
        subtotal: 0.01, totalAmount: 0.01, discountAmount: 999, shippingCost: 0,
        isPaid: true, user: fx.userA._id.toString(), userId: fx.userA._id.toString(),
    }));
    check("checkout created", r.status === 200 && r.data?.success, JSON.stringify(r.data)?.slice(0, 200));
    check("subtotal is the DB price (2 × $50 = $100), not the client's", r.data?.summary?.subtotal === 100, JSON.stringify(r.data?.summary));
    check("no discount applied from the client's discountAmount", r.data?.summary?.discountAmount === 0);
    check("total = subtotal + server shipping", Math.abs(r.data?.summary?.totalAmount - (100 + r.data?.summary?.shippingCost)) < 0.001);
    const priceToken = r.data?.guestToken;
    check("guest token is 43 url-safe characters", /^[A-Za-z0-9_-]{43}$/.test(priceToken || ""));
    const pendPrice = await PendingOrder.findOne({ squareOrderId: r.data?.squareOrderId }).select("+guest.accessTokenHash").lean();
    check("pending order is a guest checkout with no user", pendPrice?.isGuest === true && !pendPrice?.userId);
    check("only the token's SHA-256 is stored, never the token", pendPrice?.guest?.accessTokenHash === sha256(priceToken) && !JSON.stringify(pendPrice).includes(priceToken));
    check("mass-assigned fields not stored (isPaid/user)", !("isPaid" in pendPrice) && !("user" in pendPrice));

    /* ─────────────────────────────────────────────────────────── */
    section("3. Idempotency — retries and double-submits");

    const attemptId = crypto.randomUUID();
    const idemBody = base({ email: `idem@${EMAIL_DOMAIN}`, checkoutAttemptId: attemptId });
    const first = await guestCheckout(idemBody);
    const second = await guestCheckout(idemBody);
    check("same attempt id → same payment link", first.data?.checkoutUrl && first.data.checkoutUrl === second.data?.checkoutUrl);
    check("replay issues a fresh token", second.data?.guestToken && second.data.guestToken !== first.data.guestToken);
    let v = await call("POST", "/orders/guest/view", { body: { token: first.data.guestToken } });
    check("…and the superseded token stops working", v.status === 404, `${v.status}`);
    v = await call("POST", "/orders/guest/view", { body: { token: second.data.guestToken } });
    check("…while the new one sees the checkout as processing (202)", v.status === 202 && v.data?.code === "ORDER_PROCESSING", `${v.status}`);
    const changed = await guestCheckout({ ...idemBody, cartItems: [redS(2)] });
    check("same attempt id, different cart → 409 CHECKOUT_CHANGED", changed.status === 409 && changed.data?.code === "CHECKOUT_CHANGED");
    check("exactly one pending order for the attempt", (await PendingOrder.countDocuments({ checkoutAttemptId: attemptId })) === 1);

    const raceId = crypto.randomUUID();
    const raceBody = base({ email: `race@${EMAIL_DOMAIN}`, checkoutAttemptId: raceId });
    const raced = await Promise.all([guestCheckout(raceBody), guestCheckout(raceBody), guestCheckout(raceBody)]);
    check("3 simultaneous identical requests all succeed", raced.every((x) => x.data?.success), JSON.stringify(raced.map((x) => x.status)));
    check("…with one payment link between them", new Set(raced.map((x) => x.data?.checkoutUrl)).size === 1);
    check("…and one pending order", (await PendingOrder.countDocuments({ checkoutAttemptId: raceId })) === 1);

    /* ─────────────────────────────────────────────────────────── */
    section("4. Webhook & payment verification — forged and unpaid");

    const unpaid = await guestCheckout(base({ email: `unpaid@${EMAIL_DOMAIN}` }));
    const unpaidOrderId = unpaid.data.squareOrderId;
    const stockBefore = await stockOf(K._id, "Red", "S");

    check("unsigned webhook is rejected (no order)", (await sendWebhook(unpaidOrderId, { sign: false })) === 200
        && !(await Order.exists({ "paymentResult.squareOrderId": unpaidOrderId })));
    await sendWebhook(unpaidOrderId, { key: "wrong-key" });
    check("webhook signed with the wrong key is rejected (no order)", !(await Order.exists({ "paymentResult.squareOrderId": unpaidOrderId })));
    await sendWebhook(unpaidOrderId);
    check("CORRECTLY signed 'COMPLETED' webhook for an UNPAID order creates nothing (Square is asked directly)",
        !(await Order.exists({ "paymentResult.squareOrderId": unpaidOrderId })));
    r = await call("POST", "/orders/guest/confirm", { body: { token: unpaid.data.guestToken } });
    check("guest confirm on an unpaid checkout → 400 PAYMENT_NOT_COMPLETED", r.status === 400 && r.data?.code === "PAYMENT_NOT_COMPLETED", JSON.stringify(r.data));
    check("no stock moved for the unpaid checkout", (await stockOf(K._id, "Red", "S")) === stockBefore);

    /* ─────────────────────────────────────────────────────────── */
    section("5. Guest order, paid in the sandbox — created by the WEBHOOK");

    const guestEmail = `Guest.One+shop@${EMAIL_DOMAIN}`;
    const g1 = await guestCheckout(base({ email: guestEmail, cartItems: [redS(2)], checkoutAttemptId: crypto.randomUUID() }));
    check("guest checkout created", g1.data?.success, JSON.stringify(g1.data)?.slice(0, 200));
    const stockG1 = await stockOf(K._id, "Red", "S");
    await pay(g1.data.checkoutUrl);
    check("paid in Square sandbox", true);

    const hooks = await Promise.all([sendWebhook(g1.data.squareOrderId), sendWebhook(g1.data.squareOrderId), sendWebhook(g1.data.squareOrderId)]);
    check("3 duplicate signed webhooks all answered 200", hooks.every((s) => s === 200), JSON.stringify(hooks));
    const g1Orders = await Order.find({ "paymentResult.squareOrderId": g1.data.squareOrderId }).select("+guest.accessTokenHash").lean();
    check("exactly ONE order created", g1Orders.length === 1, `${g1Orders.length}`);
    const g1Order = g1Orders[0];
    check("order is a guest order with no user", g1Order?.isGuest === true && !g1Order?.user);
    check("contact email stored lowercased", g1Order?.contactEmail === guestEmail.toLowerCase());
    check("order holds the guest's token hash", g1Order?.guest?.accessTokenHash === sha256(g1.data.guestToken));
    check("order is Paid with the Square payment id", g1Order?.isPaid && g1Order?.orderStatus === "Paid" && !!g1Order?.paymentResult?.squarePaymentId && !g1Order.paymentResult.squarePaymentId.startsWith("FORGED"));
    check("totals are the server's", g1Order?.subtotal === 100 && Math.abs(g1Order.totalAmount - g1.data.summary.totalAmount) < 0.001);
    check("unicode/emoji name stored intact", g1Order?.shippingAddress?.fullName === ADDRESS.fullName);
    check("stock decremented exactly once (by 2)", (await stockOf(K._id, "Red", "S")) === stockG1 - 2, `${stockG1} → ${await stockOf(K._id, "Red", "S")}`);
    check("pending order removed", !(await PendingOrder.exists({ squareOrderId: g1.data.squareOrderId })));

    r = await call("POST", "/orders/guest/confirm", { body: { token: g1.data.guestToken, squareOrderId: g1.data.squareOrderId } });
    check("a late confirm after the webhook doesn't duplicate (404: checkout already turned into an order)", r.status === 404 && (await Order.countDocuments({ "paymentResult.squareOrderId": g1.data.squareOrderId })) === 1, `${r.status}`);

    /* ─────────────────────────────────────────────────────────── */
    section("6. Guest order access — private link, tampering, IDOR");

    v = await call("POST", "/orders/guest/view", { body: { token: g1.data.guestToken } });
    check("private link → 200 with the order", v.status === 200 && v.data?.order?.orderId === g1Order.orderId);
    check("response contains no internal fields", leakedKeys(v.data?.order).length === 0, leakedKeys(v.data?.order).join(", "));
    check("email and phone are masked", v.data?.order?.contactEmail?.includes("•") && v.data?.order?.shippingAddress?.phone?.startsWith("••••"));
    const t = g1.data.guestToken;
    const tampered = t.slice(0, -1) + (t.endsWith("A") ? "B" : "A");
    const genericMsg = (x) => x.status === 404 && x.data?.message === "This order link is invalid or has expired.";
    check("tampered token → generic 404", genericMsg(await call("POST", "/orders/guest/view", { body: { token: tampered } })));
    check("malformed token → same generic 404", genericMsg(await call("POST", "/orders/guest/view", { body: { token: "abc" } })));
    check("token as {$ne:null} → same generic 404", genericMsg(await call("POST", "/orders/guest/view", { body: { token: { $ne: null } } })));
    check("token hash itself (DB leak) does not work as a token", genericMsg(await call("POST", "/orders/guest/view", { body: { token: sha256(t).slice(0, 43) } })));
    check("token in the query string is ignored", genericMsg(await call("POST", `/orders/guest/view?token=${t}`, { body: {} })));

    r = await call("GET", `/orders/${g1Order._id}`, { token: tokenB });
    check("IDOR: another customer GET /orders/:id of a guest order → 403", r.status === 403, `${r.status}`);
    r = await call("GET", `/orders/${g1Order._id}`);
    check("IDOR: anonymous GET /orders/:id → 401", r.status === 401);
    r = await call("GET", "/orders", { token: tokenB });
    check("non-admin can't list all orders → 403", r.status === 403);

    await Order.updateOne({ _id: g1Order._id }, { $set: { "guest.accessTokenExpiresAt": new Date(Date.now() - 1000) } });
    check("expired link → generic 404", genericMsg(await call("POST", "/orders/guest/view", { body: { token: t } })));
    await Order.updateOne({ _id: g1Order._id }, { $set: { "guest.accessTokenExpiresAt": new Date(Date.now() + 86400000) } });

    /* ─────────────────────────────────────────────────────────── */
    section("7. Lookup by order number + email (no link)");

    r = await call("POST", "/orders/guest/lookup", { body: { orderId: g1Order.orderId, email: guestEmail.toUpperCase() } });
    check("correct order + email (any case) → 200", r.status === 200 && r.data?.order?.orderId === g1Order.orderId, JSON.stringify(r.data)?.slice(0, 160));
    check("…reduced view: no street, postcode or phone", r.data?.order?.limitedView === true && !r.data.order.shippingAddress.addressLine1 && !r.data.order.shippingAddress.zipCode && !r.data.order.shippingAddress.phone);
    check("…no internal fields", leakedKeys(r.data?.order).length === 0);
    const wrongEmail = await call("POST", "/orders/guest/lookup", { body: { orderId: g1Order.orderId, email: `other@${EMAIL_DOMAIN}` } });
    const wrongId = await call("POST", "/orders/guest/lookup", { body: { orderId: "PHN-1700000000000-ABCDEF", email: guestEmail } });
    check("wrong email and wrong order number give the identical response",
        wrongEmail.status === 404 && wrongId.status === 404 && wrongEmail.data?.message === wrongId.data?.message);
    r = await call("POST", "/orders/guest/lookup", { body: { orderId: { $ne: null }, email: { $ne: null } } });
    check("lookup with operators → same 404", r.status === 404);
    r = await call("POST", "/orders/guest/lookup", { body: { orderId: g1Order.orderId, email: guestEmail.replace("+shop", "") } });
    check("a +alias variant of the email does not match (exact checkout email required)", r.status === 404);

    /* ─────────────────────────────────────────────────────────── */
    section("8. Guest order, paid in the sandbox — created by CONFIRM (no webhook)");

    const g2 = await guestCheckout(base({ email: fx.userA.email, cartItems: [redS(1)], checkoutAttemptId: crypto.randomUUID() }));
    await pay(g2.data.checkoutUrl);
    const confirms = await Promise.all([1, 2, 3].map(() => call("POST", "/orders/guest/confirm", { body: { token: g2.data.guestToken, squareOrderId: g2.data.squareOrderId } })));
    check("3 concurrent confirms all return the order", confirms.every((c) => c.data?.success && c.data.order?.orderId), JSON.stringify(confirms.map((c) => c.status)));
    check("…one order only", (await Order.countDocuments({ "paymentResult.squareOrderId": g2.data.squareOrderId })) === 1);
    check("confirm response contains no internal fields", confirms.every((c) => leakedKeys(c.data?.order).length === 0));
    const g2Order = await Order.findOne({ "paymentResult.squareOrderId": g2.data.squareOrderId }).lean();

    /* ─────────────────────────────────────────────────────────── */
    section("9. Guest email that belongs to an existing account");

    r = await call("GET", "/orders/my", { token: tokenA });
    check("a guest order with Alice's email is NOT in Alice's orders automatically",
        r.status === 200 && !r.data.orders.some((o) => o.orderId === g2Order.orderId));
    r = await call("POST", "/orders/guest/claim", { token: tokenB, body: { token: g2.data.guestToken } });
    check("Bob (different email) holding the link can't claim it → 403 EMAIL_MISMATCH", r.status === 403 && r.data?.code === "EMAIL_MISMATCH", JSON.stringify(r.data));
    r = await call("POST", "/orders/guest/claim", { token: tokenA, body: { token: tampered } });
    check("Alice with a tampered link can't claim → 404", r.status === 404);
    r = await call("POST", "/orders/guest/claim", { body: { token: g2.data.guestToken } });
    check("claim without signing in → 401", r.status === 401);
    r = await call("POST", "/orders/guest/claim", { token: tokenAdmin, body: { token: g2.data.guestToken } });
    check("admin can't claim → 403", r.status === 403);
    r = await call("POST", "/orders/guest/claim", { token: tokenA, body: { token: g2.data.guestToken } });
    check("Alice (matching email + link) claims it", r.status === 200 && r.data?.order?.orderId === g2Order.orderId, JSON.stringify(r.data));
    r = await call("GET", "/orders/my", { token: tokenA });
    check("…and it now appears in Alice's orders", r.data.orders.some((o) => o.orderId === g2Order.orderId));
    r = await call("GET", `/orders/${g2Order._id}`, { token: tokenA });
    check("…and Alice can open it by id", r.status === 200);
    r = await call("POST", "/orders/guest/claim", { token: tokenB, body: { token: g2.data.guestToken } });
    check("a second claim by someone else → 409", r.status === 409 || r.status === 403, `${r.status}`);
    r = await call("POST", "/auth/login", { body: { email: { $regex: "^alice" }, password: PASSWORD } });
    check("login with an operator in the email field → 401 (no account match by pattern)", r.status === 401 && !r.data?.token);

    /* ─────────────────────────────────────────────────────────── */
    section("10. Promo codes for guests");

    r = await call("POST", "/promo/guest/validate", { body: { code: "e2eg10", cartItems: [redS(2)] } });
    check("guest Apply → server-computed 10% of $100", r.status === 200 && r.data?.promo?.discountAmount === 10, JSON.stringify(r.data));
    r = await call("POST", "/promo/guest/validate", { body: { code: "NOPE", cartItems: [redS(1)] } });
    check("unknown code → PROMO_NOT_FOUND", r.data?.code === "PROMO_NOT_FOUND");

    const pEmail = `promo.user@${EMAIL_DOMAIN}`;
    const p1 = await guestCheckout(base({ email: pEmail, promoCode: "E2EG10", cartItems: [redS(2)], checkoutAttemptId: crypto.randomUUID() }));
    check("guest checkout with promo → discount applied server-side", p1.data?.summary?.discountAmount === 10, JSON.stringify(p1.data)?.slice(0, 200));
    await pay(p1.data.checkoutUrl);
    await call("POST", "/orders/guest/confirm", { body: { token: p1.data.guestToken } });
    const red1 = await PromoRedemption.findOne({ squareOrderId: p1.data.squareOrderId }).lean();
    check("redemption CONFIRMED and attributed to the guest email", red1?.status === "CONFIRMED" && red1?.guestEmailKey === pEmail && !red1?.user);

    for (const alias of [pEmail, "PROMO.USER@e2e-guest.test", `promo.user+again@${EMAIL_DOMAIN}`]) {
        r = await guestCheckout(base({ email: alias, promoCode: "E2EG10" }));
        check(`reuse by the same customer (${alias}) → PROMO_USER_LIMIT_REACHED`, r.data?.code === "PROMO_USER_LIMIT_REACHED", JSON.stringify(r.data));
    }
    r = await guestCheckout(base({ email: `someone.else@${EMAIL_DOMAIN}`, promoCode: "E2EG10" }));
    check("a different customer can still use it", r.data?.success && r.data.summary.discountAmount > 0, JSON.stringify(r.data)?.slice(0, 160));

    r = await guestCheckout(base({ email: guestEmail, promoCode: "E2EGFIRST" }));
    check("first-order-only code refused for a guest email that already ordered", r.data?.code === "PROMO_FIRST_ORDER_ONLY", JSON.stringify(r.data));
    r = await guestCheckout(base({ email: `brand.new@${EMAIL_DOMAIN}`, promoCode: "E2EGFIRST" }));
    check("first-order-only code accepted for a new guest email", r.data?.success, JSON.stringify(r.data)?.slice(0, 160));
    r = await call("POST", "/payments/create-checkout", { token: tokenA, body: { cartItems: [redS(1)], shippingAddress: ADDRESS, promoCode: "E2EGFIRST" } });
    check("Alice (who has a claimed order) is refused the first-order code", r.data?.code === "PROMO_FIRST_ORDER_ONLY", JSON.stringify(r.data));

    /* ─────────────────────────────────────────────────────────── */
    section("11. Inventory race — two guests buy the LAST item");

    const lastStock = await stockOf(K._id, "Red", "M");
    check("fixture: exactly one Red/M left", lastStock === 1);
    const ra = await guestCheckout(base({ email: `race.a@${EMAIL_DOMAIN}`, cartItems: [lineOf(K, "Red", "M", 1)], checkoutAttemptId: crypto.randomUUID() }));
    const rb = await guestCheckout(base({ email: `race.b@${EMAIL_DOMAIN}`, cartItems: [lineOf(K, "Red", "M", 1)], checkoutAttemptId: crypto.randomUUID() }));
    check("both could start checkout (stock is checked, not reserved)", ra.data?.success && rb.data?.success);
    await Promise.all([pay(ra.data.checkoutUrl), pay(rb.data.checkoutUrl)]);
    await Promise.all([
        call("POST", "/orders/guest/confirm", { body: { token: ra.data.guestToken } }),
        call("POST", "/orders/guest/confirm", { body: { token: rb.data.guestToken } }),
    ]);
    const raceOrders = await Order.find({ "paymentResult.squareOrderId": { $in: [ra.data.squareOrderId, rb.data.squareOrderId] } }).lean();
    check("both paid orders exist (money was taken)", raceOrders.length === 2);
    check("exactly one is on fulfilment hold for the admin", raceOrders.filter((o) => o.fulfillmentHold).length === 1);
    check("stock is 0, never negative", (await stockOf(K._id, "Red", "M")) === 0);

    /* ─────────────────────────────────────────────────────────── */
    section("12. Saved cart (signed-in)");

    await call("DELETE", "/cart", { token: tokenB });
    r = await call("POST", "/cart/items", { token: tokenB, body: redS(2) });
    check("add → cart hydrated with the DB price", r.data?.items?.[0]?.price === 50 && r.data.items[0].quantity === 2, JSON.stringify(r.data));
    r = await call("POST", "/cart/items", { token: tokenB, body: redS(19) });
    check("adding past 20 caps the line at 20", r.data?.items?.[0]?.quantity === 20);
    r = await call("PUT", "/cart/items", { token: tokenB, body: redS(3) });
    check("set quantity → 3", r.data?.items?.[0]?.quantity === 3);
    for (const q of [0, -2, 2.5, 21, "3"]) {
        r = await call("PUT", "/cart/items", { token: tokenB, body: { ...redS(), quantity: q } });
        check(`set quantity ${JSON.stringify(q)} → 400`, r.status === 400);
    }
    r = await call("POST", "/cart/items", { token: tokenB, body: { productId: { $ne: null }, color: "Red", size: "S", quantity: 1 } });
    check("operator injection in productId → 400", r.status === 400);
    r = await call("POST", "/cart/items", { token: tokenB, body: { ...redS(1), price: 0.01 } });
    check("client price ignored", r.data?.items?.[0]?.price === 50);
    r = await call("POST", "/cart/merge", { token: tokenB, body: { items: [redS(18), lineOf(K, "Blue", "S", 1), { productId: "bad", quantity: 1 }] } });
    const redLine = r.data?.items?.find((i) => i.color === "Red" && i.size === "S");
    check("merge adds quantities and caps at 20 (4 + 18 → 20)", redLine?.quantity === 20, JSON.stringify(r.data?.items));
    check("merge keeps a valid sold-out line and skips invalid lines", r.data?.items?.length === 2);
    r = await call("GET", "/cart", { token: tokenA });
    check("another user's cart is separate", r.status === 200 && !r.data.items.some((i) => i.quantity === 20));
    r = await call("GET", "/cart");
    check("cart requires sign-in → 401", r.status === 401);
    r = await call("DELETE", "/cart/items", { token: tokenB, body: lineOf(K, "Blue", "S") });
    check("remove a line", r.data?.items?.length === 1);

    /* ─────────────────────────────────────────────────────────── */
    section("13. Signed-in checkout — regression");

    await call("DELETE", "/cart", { token: tokenB });
    await call("POST", "/cart/items", { token: tokenB, body: redS(1) });
    await call("POST", "/cart/items", { token: tokenB, body: lineOf(K, "Blue", "S", 1) });
    const acct = await call("POST", "/payments/create-checkout", { token: tokenB, body: { cartItems: [redS(1)], shippingAddress: ADDRESS, checkoutSource: "cart", checkoutAttemptId: crypto.randomUUID() } });
    check("signed-in create-checkout works (no email sent → account email used)", acct.data?.success && !acct.data.guestToken, JSON.stringify(acct.data)?.slice(0, 200));
    r = await call("POST", "/payments/create-checkout", { body: { cartItems: [redS(1)], shippingAddress: ADDRESS } });
    check("signed-in endpoint still requires auth → 401", r.status === 401);
    r = await call("POST", "/payments/create-checkout", { token: tokenAdmin, body: { cartItems: [redS(1)], shippingAddress: ADDRESS } });
    check("admin still blocked → 403 ADMIN_CANNOT_ORDER", r.status === 403 && r.data?.code === "ADMIN_CANNOT_ORDER");
    await pay(acct.data.checkoutUrl);
    r = await call("POST", "/orders/verify-square-payment", { token: tokenB, body: { squareOrderId: acct.data.squareOrderId } });
    check("signed-in confirm creates the order (full order document, as before)", r.data?.success && r.data.order?.user === fx.userB._id.toString(), JSON.stringify(r.data)?.slice(0, 200));
    const acctOrder = await Order.findOne({ "paymentResult.squareOrderId": acct.data.squareOrderId }).lean();
    check("order: user set, not guest, contact email = account email", acctOrder?.user?.toString() === fx.userB._id.toString() && acctOrder.isGuest === false && acctOrder.contactEmail === fx.userB.email);
    r = await call("GET", "/orders/my", { token: tokenB });
    check("appears in My Orders", r.data?.orders?.some((o) => o.orderId === acctOrder.orderId));
    r = await call("GET", "/orders/latest-paid", { token: tokenB });
    check("latest-paid polling returns it", r.data?.order?.orderId === acctOrder.orderId);
    r = await call("GET", "/cart", { token: tokenB });
    check("purchased line removed from the saved cart, the other kept", r.data?.items?.length === 1 && r.data.items[0].color === "Blue", JSON.stringify(r.data?.items));
    const contactAcct = await call("POST", "/payments/create-checkout", { token: tokenB, body: { cartItems: [redS(1)], shippingAddress: ADDRESS, contactEmail: "not an email" } });
    check("signed-in invalid contact email → 400 field contactEmail", contactAcct.status === 400 && contactAcct.data?.field === "contactEmail");

    /* ─────────────────────────────────────────────────────────── */
    section("14. Admin views");

    r = await call("GET", "/orders", { token: tokenAdmin });
    const adminGuest = r.data?.orders?.find((o) => o.orderId === g1Order.orderId);
    check("admin list includes guest orders, labelled isGuest", adminGuest?.isGuest === true && !adminGuest.user && adminGuest.contactEmail === guestEmail.toLowerCase());
    check("admin list never includes token hashes", !JSON.stringify(r.data).includes(sha256(g1.data.guestToken)));
    r = await call("GET", `/orders/${g1Order._id}`, { token: tokenAdmin });
    check("admin opens a guest order (was a 500 crash on order.user._id)", r.status === 200 && r.data?.order?.orderId === g1Order.orderId);
    r = await call("PUT", `/orders/${g1Order._id}/status`, { token: tokenAdmin, body: { status: "Shipped" } });
    check("admin updates a guest order's status", r.status === 200 && r.data?.order?.orderStatus === "Shipped", JSON.stringify(r.data)?.slice(0, 160));
    v = await call("POST", "/orders/guest/view", { body: { token: g1.data.guestToken } });
    check("guest sees the new status", v.data?.order?.orderStatus === "Shipped");

    /* ─────────────────────────────────────────────────────────── */
    section("15. Sweeper — abandoned and recovered checkouts (issue 3)");

    const { sweepUnpaidCheckouts } = await import("../services/pendingOrderSweeper.js");
    const { default: squareClient } = await import("../services/squareClient.js");

    const abandoned = await guestCheckout(base({ email: `abandon@${EMAIL_DOMAIN}`, promoCode: "E2EG10", checkoutAttemptId: crypto.randomUUID() }));
    const recovered = await guestCheckout(base({ email: `recover@${EMAIL_DOMAIN}`, checkoutAttemptId: crypto.randomUUID() }));
    await pay(recovered.data.checkoutUrl); // paid, but neither webhook nor confirm ever arrive
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await PendingOrder.updateMany(
        { squareOrderId: { $in: [abandoned.data.squareOrderId, recovered.data.squareOrderId] } },
        { $set: { createdAt: twoHoursAgo } }
    );
    const sweep = await sweepUnpaidCheckouts();
    check("sweeper ran without errors", sweep.errors === 0, JSON.stringify(sweep));
    const abandonedPending = await PendingOrder.findOne({ squareOrderId: abandoned.data.squareOrderId }).lean();
    check("unpaid checkout: link marked deactivated, record kept for late payments", !!abandonedPending?.linkDeactivatedAt);
    const linkGone = await squareClient.checkout.paymentLinks.get({ id: abandonedPending.paymentLinkId }).then(() => false).catch((e) => e.statusCode === 404);
    check("…and the Square payment link is deleted", linkGone);
    const abandonedRed = await PromoRedemption.findOne({ squareOrderId: abandoned.data.squareOrderId }).lean();
    check("…and its promo slot released", abandonedRed?.status === "RELEASED");
    check("paid-but-never-confirmed checkout recovered into an order",
        await Order.exists({ "paymentResult.squareOrderId": recovered.data.squareOrderId }));
    r = await guestCheckout({ ...base({ email: `abandon@${EMAIL_DOMAIN}`, promoCode: "E2EG10" }), checkoutAttemptId: abandonedPending.checkoutAttemptId });
    check("retrying a deactivated checkout's attempt id → 409 CHECKOUT_EXPIRED", r.status === 409 && r.data?.code === "CHECKOUT_EXPIRED", JSON.stringify(r.data));

    /* ─────────────────────────────────────────────────────────── */
    section("16. Rate limits (one client address)");

    const ip = "10.250.250.250";
    const lookups = [];
    for (let i = 0; i < 12; i += 1) {
        lookups.push((await call("POST", "/orders/guest/lookup", { ip, body: { orderId: "PHN-1700000000000-ABCDEF", email: `x${i}@${EMAIL_DOMAIN}` } })).status);
    }
    check("order lookup: 11th request from one address → 429", lookups.slice(0, 10).every((s) => s === 404) && lookups[10] === 429, JSON.stringify(lookups));
    const limited = await call("POST", "/orders/guest/lookup", { ip, body: {} });
    check("429 uses the API's response shape", limited.data?.code === "RATE_LIMITED" && limited.data?.success === false);
    check("…and another address is unaffected", (await call("POST", "/orders/guest/lookup", { body: { orderId: "PHN-1", email: "a@b.test" } })).status === 404);

    const logins = [];
    for (let i = 0; i < 11; i += 1) {
        logins.push((await call("POST", "/auth/login", { ip: "10.250.250.251", body: { email: fx.userB.email, password: "wrong-password" } })).status);
    }
    check("login: 11th wrong password for one account from one address → 429", logins.slice(0, 10).every((s) => s === 401) && logins[10] === 429, JSON.stringify(logins));

    const tokens = [];
    for (let i = 0; i < 121; i += 1) {
        tokens.push((await call("POST", "/orders/guest/view", { ip: "10.250.250.252", body: { token: crypto.randomBytes(32).toString("base64url") } })).status);
    }
    check("token guessing: 121st attempt from one address → 429", tokens.slice(0, 120).every((s) => s === 404) && tokens[120] === 429);

    const checkouts = [];
    for (let i = 0; i < 21; i += 1) {
        checkouts.push((await call("POST", "/payments/guest/create-checkout", { ip: "10.250.250.253", body: { email: `rl${i}@${EMAIL_DOMAIN}`, cartItems: [] } })).status);
    }
    check("guest checkout: 21st request from one address → 429", checkouts[20] === 429, JSON.stringify(checkouts));
} catch (error) {
    failed += 1;
    failures.push(`UNCAUGHT: ${error?.message}`);
    console.error("\nUNCAUGHT ERROR:", error);
} finally {
    if (browser) await browser.close().catch(() => {});
    if (!args.has("--keep")) {
        const removed = await cleanup();
        console.log("\nCleaned up fixtures:", JSON.stringify(removed));
    }
    await mongoose.disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) console.log("Failed:\n  - " + failures.join("\n  - "));
process.exit(failed ? 1 : 0);
