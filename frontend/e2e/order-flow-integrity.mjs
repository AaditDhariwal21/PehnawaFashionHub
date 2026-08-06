/**
 * End-to-end checks for the out-of-stock card badge and the admin order block.
 *
 *   TASK 2  A product with zero stock across ALL variants shows an "Out of
 *           Stock" badge on its card; a product with even one variant still in
 *           stock does not. Clicking an out-of-stock card still opens its
 *           product page.
 *
 *   TASK 3  An admin account sees the Pay Now button DISABLED with the message
 *           "Admin accounts cannot place orders." A customer account in the same
 *           state does not.
 *
 * NETWORK ISOLATION — read before running.
 *
 * This project's VITE_API_URL is baked in at build time and points at the live
 * production backend. So this script does not merely stub the endpoints it
 * cares about: it intercepts EVERY request and refuses anything that is not the
 * local origin, failing loudly if one is attempted. Nothing here can reach
 * production, and no order or payment is ever created — the checkout assertions
 * are about the button's state, and the button is never clicked.
 *
 * Auth is injected via localStorage, which is exactly where AuthContext reads
 * it from, so no login round-trip is needed either.
 *
 * Usage:
 *   npx vite preview --port 4173      (or: npx vite dev --port 4173)
 *   node e2e/order-flow-integrity.mjs [--headed] [--slow]
 */

import { chromium } from 'playwright';

/* ── Config ──────────────────────────────────────────────────── */

const CFG = {
    baseUrl: process.env.E2E_BASE_URL || 'http://localhost:4173',
};

const headed = process.argv.includes('--headed');
const slowMo = process.argv.includes('--slow') ? 350 : 0;

/** Set E2E_SHOT_DIR to capture the checkout summary panel for both roles. */
const SHOT_DIR = process.env.E2E_SHOT_DIR || '';

/* ── Assertion harness (same shape as e2e/variant-editor.mjs) ── */

let passed = 0;
let failed = 0;

const check = (name, condition, detail = '') => {
    if (condition) {
        passed += 1;
        console.log(`  ✓ ${name}`);
    } else {
        failed += 1;
        console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
    }
};

const section = (title) => console.log(`\n── ${title} ──`);

/* ── Fixtures ────────────────────────────────────────────────── */

const IMG = [{ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', publicId: 'sample' }];

/** Every variant at zero — the only case that should show the badge. */
const SOLD_OUT = {
    _id: '000000000000000000000001',
    name: 'Sold Out Kurta',
    slug: 'sold-out-kurta',
    categorySlug: 'mens-kurta',
    description: 'x',
    price: 100,
    gender: 'Men',
    category: "Men's Kurta",
    images: IMG,
    colors: [{ colorName: 'Red', images: IMG }],
    variants: [
        { color: 'Red', size: 'S', price: 90, stock: 0 },
        { color: 'Red', size: 'M', price: 95, stock: 0 },
    ],
    specialTags: [],
};

/** One size gone, one size left. Must NOT be marked unavailable. */
const PARTIAL = {
    _id: '000000000000000000000002',
    name: 'Partly Available Kurta',
    slug: 'partly-available-kurta',
    categorySlug: 'mens-kurta',
    description: 'x',
    price: 100,
    gender: 'Men',
    category: "Men's Kurta",
    images: IMG,
    colors: [{ colorName: 'Blue', images: IMG }],
    variants: [
        { color: 'Blue', size: 'S', price: 90, stock: 0 },
        { color: 'Blue', size: 'M', price: 95, stock: 4 },
    ],
    specialTags: [],
};

/** Fully stocked, and carrying a promo tag — checks the two badges coexist. */
const IN_STOCK = {
    _id: '000000000000000000000003',
    name: 'Plentiful Kurta',
    slug: 'plentiful-kurta',
    categorySlug: 'mens-kurta',
    description: 'x',
    price: 100,
    gender: 'Men',
    category: "Men's Kurta",
    images: IMG,
    colors: [{ colorName: 'Green', images: IMG }],
    variants: [{ color: 'Green', size: 'M', price: 95, stock: 12 }],
    specialTags: ['New Arrival'],
};

const CART_ITEM = {
    productId: IN_STOCK._id,
    name: IN_STOCK.name,
    image: IMG[0].url,
    size: 'M',
    color: 'Green',
    price: 95,
    quantity: 1,
};

const adminUser = { _id: 'a1', name: 'Site Admin', email: 'admin@pehnawa.test', role: 'admin' };
const customerUser = { _id: 'c1', name: 'Real Customer', email: 'cust@pehnawa.test', role: 'user' };

const SAVED_ADDRESS = {
    fullName: 'Test Customer',
    phone: '5550000000',
    addressLine1: '1 Test Street',
    addressLine2: '',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    country: 'United States',
};

/* ── Network isolation ───────────────────────────────────────── */

/** Requests that would have left the machine, split by what they were after. */
const offHostAttempts = [];   // the app's own API — must stay empty
const thirdPartyBlocked = []; // e.g. the Google Sign-In widget's SDK script

/**
 * Third-party SDKs the page pulls in on its own (the Google OAuth button). They
 * are blocked like everything else; they are tracked separately because the
 * assertion that matters is "nothing reached the Pehnawa backend", and lumping a
 * sign-in widget's script in with that would fail the run for the wrong reason.
 */
const THIRD_PARTY = [
    'accounts.google.com',
    'apis.google.com',
    'gstatic.com',
    'googletagmanager.com',
    'fonts.googleapis.com',
];

const installStubs = async (context) => {
    await context.route('**/*', async (route) => {
        const url = route.request().url();

        /* Local origin: the app's own HTML, JS, CSS. Let it through. */
        if (url.startsWith(CFG.baseUrl) && !url.includes('/api/')) {
            return route.continue();
        }
        /* data:/blob: inlined assets. */
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            return route.continue();
        }

        const json = (body, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

        /* Cloudinary and any other image host: a 1x1 gif, never a real fetch. */
        if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url) || url.includes('res.cloudinary.com')) {
            return route.fulfill({
                status: 200,
                contentType: 'image/gif',
                body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
            });
        }

        /* ── The API surface these two tasks touch ── */
        if (url.includes('/products/category/')) {
            return json({ success: true, count: 3, products: [SOLD_OUT, PARTIAL, IN_STOCK] });
        }
        if (url.includes('/products/special/') || url.includes('/products/tag/')) {
            return json({ success: true, count: 3, products: [SOLD_OUT, PARTIAL, IN_STOCK] });
        }
        if (url.includes('/products/covers') || url.includes('/category-covers')) {
            return json({ success: true, covers: {} });
        }
        if (url.includes('/products')) {
            return json({ success: true, count: 3, products: [SOLD_OUT, PARTIAL, IN_STOCK] });
        }
        if (url.includes('/users/me')) {
            return json({ success: true, user: { ...customerUser, address: SAVED_ADDRESS } });
        }
        if (url.includes('/shipping/rates')) {
            return json({ success: true, shippingCost: 8, service: 'USPS Priority' });
        }
        if (url.includes('/wishlist')) {
            return json({ success: true, wishlist: { products: [] } });
        }
        if (url.includes('/promo')) {
            return json({ success: false, message: 'stubbed' });
        }

        /* Anything else that would have left the machine. Order-creating
           endpoints land here deliberately: if the checkout ever posted one,
           this records it and the run fails rather than silently passing. */
        if (THIRD_PARTY.some((host) => url.includes(host))) {
            thirdPartyBlocked.push(url);
            return route.abort();
        }
        offHostAttempts.push(url);
        return json({ success: false, message: 'blocked by e2e isolation' }, 599);
    });
};

/** Seed auth + cart the way the app itself stores them, before any script runs. */
const seedSession = (context, user, cart) =>
    context.addInitScript(
        ([u, c]) => {
            localStorage.setItem('user', JSON.stringify(u));
            localStorage.setItem('token', 'e2e-fake-token');
            localStorage.setItem('pehnawa_cart', JSON.stringify(c));
            localStorage.removeItem('pehnawa_buyNow');
        },
        [user, cart]
    );

/* ── Card-level queries ──────────────────────────────────────── */

/**
 * The badge for one product, located by walking up from the product's name to
 * the card that contains it. Deliberately not a global count: the point of
 * Task 2 is *which* card is marked, so each assertion is scoped to one card.
 */
const cardBadgeCount = (page, productName) =>
    page.evaluate((name) => {
        const heading = Array.from(document.querySelectorAll('h3'))
            .find((h) => h.textContent.trim() === name);
        if (!heading) return -1;

        /* Climb to the nearest ancestor that also contains an image — that is
           the card, whatever wrapper markup the surface happens to use. */
        let card = heading;
        for (let i = 0; i < 6 && card.parentElement; i += 1) {
            card = card.parentElement;
            if (card.querySelector('img')) break;
        }
        return Array.from(card.querySelectorAll('span'))
            .filter((s) => s.textContent.trim().toLowerCase() === 'out of stock')
            .length;
    }, productName);

/* ── Runner ──────────────────────────────────────────────────── */

const run = async () => {
    const browser = await chromium.launch({ headless: !headed, slowMo });

    try {
        /* ═══════════════════════════════════════════════════════
           TASK 2 — Out of Stock badge on listing cards
           ═══════════════════════════════════════════════════════ */
        section('TASK 2  Out of Stock badge on product listing cards');
        {
            const context = await browser.newContext();
            await installStubs(context);
            await seedSession(context, customerUser, []);
            const page = await context.newPage();

            await page.goto(`${CFG.baseUrl}/products/Men`, { waitUntil: 'networkidle' });
            await page.waitForSelector('h3', { timeout: 15000 });

            const soldOutBadges = await cardBadgeCount(page, SOLD_OUT.name);
            const partialBadges = await cardBadgeCount(page, PARTIAL.name);
            const inStockBadges = await cardBadgeCount(page, IN_STOCK.name);

            check('all three product cards rendered',
                soldOutBadges >= 0 && partialBadges >= 0 && inStockBadges >= 0,
                `soldOut=${soldOutBadges} partial=${partialBadges} inStock=${inStockBadges} (-1 means card not found)`);

            check('a product with every variant at zero shows the badge',
                soldOutBadges === 1, `got ${soldOutBadges} badge(s) on "${SOLD_OUT.name}"`);

            check('a product with ONE size still in stock does NOT show it',
                partialBadges === 0, `got ${partialBadges} badge(s) on "${PARTIAL.name}"`);

            check('a fully stocked product does NOT show it',
                inStockBadges === 0, `got ${inStockBadges} badge(s) on "${IN_STOCK.name}"`);

            /* The promo tag must survive alongside; the badges use different
               corners precisely so neither hides the other. */
            check('the existing special tag still renders on the stocked card',
                await page.locator('span', { hasText: /^New Arrival$/ }).count() > 0);

            /* Design-language check: same pill geometry as the existing tags. */
            const badgeStyle = await page.evaluate(() => {
                const el = Array.from(document.querySelectorAll('span'))
                    .find((s) => s.textContent.trim().toLowerCase() === 'out of stock');
                if (!el) return null;
                const cs = getComputedStyle(el);
                return {
                    radius: cs.borderRadius,
                    position: cs.position,
                    weight: cs.fontWeight,
                    transform: cs.textTransform,
                    pointerEvents: cs.pointerEvents,
                    visible: el.getBoundingClientRect().width > 0,
                };
            });

            check('badge is a positioned pill, uppercase and bold like the other tags',
                badgeStyle
                && badgeStyle.position === 'absolute'
                && parseFloat(badgeStyle.radius) >= 100
                && Number(badgeStyle.weight) >= 700
                && badgeStyle.transform === 'uppercase',
                JSON.stringify(badgeStyle));

            check('badge is actually visible on screen',
                badgeStyle?.visible === true, JSON.stringify(badgeStyle));

            check('badge cannot intercept the card click (pointer-events: none)',
                badgeStyle?.pointerEvents === 'none', JSON.stringify(badgeStyle));

            if (SHOT_DIR) {
                await page.screenshot({ path: `${SHOT_DIR}/cards-out-of-stock.png`, fullPage: false });
            }

            /* Click-through must be unchanged for out-of-stock products. */
            await page.evaluate((name) => {
                const h = Array.from(document.querySelectorAll('h3'))
                    .find((x) => x.textContent.trim() === name);
                h.scrollIntoView();
            }, SOLD_OUT.name);
            await page.getByText(SOLD_OUT.name, { exact: true }).click();
            await page.waitForTimeout(1200);

            check('clicking an out-of-stock card still opens its product page',
                /\/product\//.test(page.url()), `landed on ${page.url()}`);

            await context.close();
        }

        /* ═══════════════════════════════════════════════════════
           TASK 3 — admin cannot place orders (UX layer)
           ═══════════════════════════════════════════════════════ */
        section('TASK 3  Checkout Pay Now button, admin vs customer');

        /** Load /checkout as `user` and report the button + message state. */
        const checkoutState = async (user, shotName) => {
            const context = await browser.newContext();
            await installStubs(context);
            await seedSession(context, user, [CART_ITEM]);
            const page = await context.newPage();

            await page.goto(`${CFG.baseUrl}/checkout`, { waitUntil: 'networkidle' });

            const payButton = page.locator('button[type="submit"]', { hasText: /Pay Now|Placing Order/i });
            await payButton.waitFor({ timeout: 15000 });

            /* Fill the address and blur ZIP so the (stubbed) shipping rate
               resolves — otherwise the button is disabled merely for want of a
               shipping cost, which would make the admin assertion meaningless. */
            await page.fill('#fullName', SAVED_ADDRESS.fullName);
            await page.fill('#contactNumber', SAVED_ADDRESS.phone);
            await page.fill('#street', SAVED_ADDRESS.addressLine1);
            await page.fill('#city', SAVED_ADDRESS.city);
            await page.fill('#state', SAVED_ADDRESS.state);
            await page.fill('#zip', SAVED_ADDRESS.zip);
            await page.locator('#zip').blur();
            await page.waitForTimeout(1500);

            const state = {
                buttonExists: await payButton.count() > 0,
                buttonVisible: await payButton.isVisible(),
                disabled: await payButton.isDisabled(),
                adminMessage: await page.getByText('Admin accounts cannot place orders.').count(),
                secureMessage: await page.getByText('Your payment information is secure').count(),
                /* Proof the shipping stub landed, so "disabled" isn't a false
                   positive from an unknown shipping cost. */
                shippingResolved: (await page.getByText('$8.00').count()) > 0
                    || (await page.getByText(/USPS/).count()) > 0,
                /* Other fields must remain usable — admins inspect checkout. */
                cityEditable: await page.locator('#city').isEditable(),
                promoInputPresent: await page.locator('input').count() > 1,
            };

            if (shotName && SHOT_DIR) {
                const summary = page.locator('.checkout-right').first();
                await (await summary.count() ? summary : page)
                    .screenshot({ path: `${SHOT_DIR}/${shotName}.png` });
            }

            await context.close();
            return state;
        };

        const admin = await checkoutState(adminUser, 'checkout-admin');
        const customer = await checkoutState(customerUser, 'checkout-customer');

        console.log('  · admin   :', JSON.stringify(admin));
        console.log('  · customer:', JSON.stringify(customer));

        check('shipping rate resolved for both, so the comparison is like-for-like',
            admin.shippingResolved && customer.shippingResolved,
            `admin=${admin.shippingResolved} customer=${customer.shippingResolved}`);

        check('ADMIN: Pay Now is disabled', admin.disabled === true);
        check('ADMIN: Pay Now is still visible, not hidden', admin.buttonVisible === true);
        check('ADMIN: the explanatory message is shown', admin.adminMessage === 1);
        check('ADMIN: the rest of checkout stays interactive',
            admin.cityEditable === true && admin.promoInputPresent === true,
            JSON.stringify(admin));

        check('CUSTOMER: Pay Now is enabled', customer.disabled === false);
        check('CUSTOMER: no admin message is shown', customer.adminMessage === 0);
        check('CUSTOMER: the usual reassurance copy is shown', customer.secureMessage === 1);

        /* ═══════════════════════════════════════════════════════
           Isolation audit
           ═══════════════════════════════════════════════════════ */
        section('Network isolation');
        check('nothing reached the Pehnawa backend — no order or payment was created',
            offHostAttempts.length === 0,
            offHostAttempts.slice(0, 5).join('\n      '));
        console.log(`  · ${thirdPartyBlocked.length} third-party SDK request(s) blocked (Google sign-in widget)`);

        console.log(`\n${'─'.repeat(62)}`);
        console.log(`${passed} passed, ${failed} failed`);
        console.log('─'.repeat(62));
    } finally {
        await browser.close();
    }

    process.exit(failed === 0 ? 0 : 1);
};

run().catch((err) => {
    console.error('\nRun crashed:', err);
    process.exit(1);
});
