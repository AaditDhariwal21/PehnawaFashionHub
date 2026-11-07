/**
 * Browser E2E for guest checkout and the signed-in regression path — against
 * the REAL local backend, the DEVELOPMENT database and the Square SANDBOX.
 *
 * Unlike order-flow-integrity.mjs this does not stub the API: it places real
 * (sandbox) orders. It therefore refuses to run unless the API it talks to is
 * localhost, and it depends on the backend's safety guards (dev database,
 * sandbox Square) for everything behind that.
 *
 * Setup:
 *   1. backend:  GUEST_CHECKOUT_ENABLED=true … node src/index.js        (see verifyGuestCheckout.js)
 *   2. fixtures: node src/scripts/verifyGuestCheckout.js --seed-only    (prints the JSON below)
 *   3. frontend: npx vite build && npx vite preview --port 5173
 *      (guest checkout is switched on by the backend's GUEST_CHECKOUT_ENABLED alone)
 *      (port 5173 because Square redirects back to FRONTEND_URL=http://localhost:5173)
 *   4. E2E_FIXTURE='<json from step 2>' node e2e/guest-checkout.mjs [--headed]
 *   5. clean up: node src/scripts/verifyGuestCheckout.js --cleanup
 *
 * Covers, at 1280×800, 360×640 and 390×844:
 *   add to cart as a visitor → guest checkout form (input types, autocomplete,
 *   Enter-to-next, inline validation, 16px inputs, 44px targets, sticky Pay bar
 *   hidden while typing, no horizontal scroll) → double-tap Pay sends ONE
 *   request → Square sandbox payment → confirmation page (order shown, cart
 *   cleared, private link) → refresh still works → private link opens Track
 *   Order → order number + email lookup.
 * Then, desktop only: a signed-in customer's cart follows them to a new
 * browser, the email is pre-filled, and checkout/My Orders work as before.
 */

import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173';
const API = process.env.E2E_API_BASE || 'http://localhost:5000/api';
const SHOT_DIR = process.env.E2E_SHOT_DIR || '';
const FIXTURE = JSON.parse(process.env.E2E_FIXTURE || 'null');
const headed = process.argv.includes('--headed');

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(API) || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
    console.error('Refusing to run: API and site must both be localhost.');
    process.exit(1);
}
if (!FIXTURE?.slug) {
    console.error('Set E2E_FIXTURE to the JSON printed by verifyGuestCheckout.js --seed-only.');
    process.exit(1);
}
if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

/* ── Harness ── */
let passed = 0;
let failed = 0;
const failures = [];
const check = (name, condition, detail = '') => {
    if (condition) { passed += 1; console.log(`  ✓ ${name}`); }
    else { failed += 1; failures.push(name); console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n── ${t} ──`);
const shot = async (page, name, fullPage = true) => {
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage });
};

const ADDRESS = {
    fullName: 'Priya Sharma',
    contactNumber: '+1 202-456-1111',
    street: '1600 Pennsylvania Ave NW',
    apartment: 'Suite 2',
    city: 'Washington',
    state: 'DC',
    zip: '20500',
};

const productUrl = `${BASE}/product/${FIXTURE.categorySlug}/${FIXTURE.slug}`;

const noHorizontalScroll = (page) =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const addToCartFromProductPage = async (page) => {
    await page.goto(productUrl, { waitUntil: 'networkidle' });
    await page.locator('button[title="Red"]').first().click();
    await page.getByRole('button', { name: 'S', exact: true }).first().click();
    const add = page.getByRole('button', { name: /^Add to Cart$/i });
    const count = await add.count();
    for (let i = 0; i < count; i += 1) {
        if (await add.nth(i).isVisible()) { await add.nth(i).click(); break; }
    }
    await page.waitForTimeout(500);
};

/** Pay on Square's sandbox testing panel, then follow its link back to the site. */
const payOnSquare = async (page) => {
    await page.waitForURL(/squareupsandbox\.com|square\.link/, { timeout: 60000 });
    await page.getByRole('button', { name: 'Next' }).click({ timeout: 30000 });
    await page.getByRole('button', { name: 'Test Payment' }).click({ timeout: 30000 });
    await page.getByText('successful', { exact: false }).first().waitFor({ timeout: 30000 });
    /* Square sends the customer to FRONTEND_URL/order-confirmation (no query
       parameters). Assert that, then open the same path on the origin under
       test — the page relies only on this origin's browser storage, so this
       is exactly what the redirect does when FRONTEND_URL is this origin. */
    const redirect = await page.getByRole('link', { name: /\/order-confirmation$/ }).first().getAttribute('href');
    check('Square redirects back to /order-confirmation with no query parameters', /\/order-confirmation$/.test(redirect || ''), redirect);
    await page.goto(`${BASE}/order-confirmation`, { waitUntil: 'domcontentloaded' });
};

const VIEWPORTS = [
    { name: 'desktop-1280x800', width: 1280, height: 800, mobile: false },
    { name: 'mobile-360x640', width: 360, height: 640, mobile: true },
    { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
];

const placed = [];
const browser = await chromium.launch({ headless: !headed });

try {
    for (const vp of VIEWPORTS) {
        section(`Guest checkout @ ${vp.name}`);
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            isMobile: vp.mobile,
            hasTouch: vp.mobile,
            deviceScaleFactor: vp.mobile ? 2 : 1,
        });
        const page = await context.newPage();
        const email = `ui.${vp.name}@e2e-guest.test`;

        await addToCartFromProductPage(page);
        const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('pehnawa_cart') || '[]'));
        check('visitor cart lives in localStorage', cart.length === 1 && cart[0].color === 'Red' && cart[0].size === 'S', JSON.stringify(cart));

        await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
        check('checkout is reachable signed out, with the guest banner', await page.getByText('Checking out as a', { exact: false }).isVisible());
        check('no horizontal scroll on checkout', await noHorizontalScroll(page));
        if (vp.mobile) {
            check('mobile bottom nav hidden on checkout', !(await page.locator('nav.fixed.bottom-0').first().isVisible().catch(() => false)));
        }

        /* Input attributes for fast mobile entry */
        const attrs = await page.evaluate(() => Object.fromEntries(
            ['email', 'fullName', 'contactNumber', 'street', 'apartment', 'city', 'state', 'zip', 'country'].map((id) => {
                const el = document.getElementById(id);
                return [id, el && {
                    type: el.type, inputMode: el.inputMode, autocomplete: el.autocomplete, enterKeyHint: el.enterKeyHint,
                    fontSize: parseFloat(getComputedStyle(el).fontSize), height: el.getBoundingClientRect().height,
                }];
            })
        ));
        check('email: type=email, inputmode=email, autocomplete=email', attrs.email?.type === 'email' && attrs.email.inputMode === 'email' && attrs.email.autocomplete === 'email');
        check('phone: type=tel, inputmode=tel, autocomplete=tel', attrs.contactNumber?.type === 'tel' && attrs.contactNumber.inputMode === 'tel' && attrs.contactNumber.autocomplete === 'tel');
        check('address autocomplete tokens set',
            attrs.fullName?.autocomplete === 'name' && attrs.street?.autocomplete === 'address-line1' && attrs.apartment?.autocomplete === 'address-line2'
            && attrs.city?.autocomplete === 'address-level2' && attrs.state?.autocomplete === 'address-level1' && attrs.zip?.autocomplete === 'postal-code'
            && attrs.country?.autocomplete === 'country-name', JSON.stringify(attrs));
        check('enterkeyhint: next on fields, done on the last', attrs.email?.enterKeyHint === 'next' && attrs.zip?.enterKeyHint === 'done');
        if (vp.mobile) {
            check('inputs are ≥16px (no iOS zoom on focus)', Object.values(attrs).every((a) => a && a.fontSize >= 16), JSON.stringify(Object.fromEntries(Object.entries(attrs).map(([k, a]) => [k, a?.fontSize]))));
            check('inputs are ≥44px tall', Object.values(attrs).every((a) => a && a.height >= 44), JSON.stringify(Object.fromEntries(Object.entries(attrs).map(([k, a]) => [k, Math.round(a?.height)]))));
            const promoFont = await page.locator('.promo-code-input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
            check('promo input is 16px on mobile', promoFont >= 16, `${promoFont}`);
        }

        /* Inline validation + Enter moves to the next field */
        await page.locator('#email').fill('not-an-email');
        await page.locator('#email').press('Enter');
        check('Enter on email moves focus to Full Name', await page.evaluate(() => document.activeElement?.id) === 'fullName');
        check('invalid email shows an inline error on blur', await page.locator('#email-error').isVisible());
        check('…and marks the field aria-invalid', (await page.locator('#email').getAttribute('aria-invalid')) === 'true');
        await page.locator('#email').fill(email);
        await page.locator('#email').blur();
        check('error clears once corrected', !(await page.locator('#email-error').isVisible().catch(() => false)));

        await page.locator('#fullName').fill(ADDRESS.fullName);
        await page.locator('#contactNumber').fill(ADDRESS.contactNumber);
        await page.locator('#street').fill(ADDRESS.street);
        await page.locator('#apartment').fill(ADDRESS.apartment);
        await page.locator('#city').fill(ADDRESS.city);
        await page.locator('#state').fill(ADDRESS.state);
        await page.locator('#zip').fill(ADDRESS.zip);

        if (vp.mobile) {
            await page.locator('#city').focus();
            await page.waitForTimeout(700);
            check('sticky Pay bar hides while a field is focused (keyboard up)',
                await page.locator('.checkout-mobile-cta').evaluate((el) => el.classList.contains('is-hidden')));
            const cityBox = await page.locator('#city').boundingBox();
            check('focused field is scrolled into the visible area', cityBox && cityBox.y >= 0 && cityBox.y + cityBox.height <= vp.height, JSON.stringify(cityBox));
        }
        await page.locator('#zip').press('Enter'); // last field: closes the keyboard, starts the shipping quote
        await page.waitForFunction(() => {
            const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) => /Pay Now/i.test(b.textContent));
            return btn && !btn.disabled;
        }, null, { timeout: 30000 });
        check('shipping calculated automatically and Pay enabled', true);

        const payBtn = page.locator('button[type="submit"]').filter({ hasText: /Pay Now/i });
        check('exactly one Pay button rendered', (await payBtn.count()) === 1);
        if (vp.mobile) {
            await page.locator('h1').first().click(); // blur everything
            await page.waitForTimeout(400);
            const box = await payBtn.boundingBox();
            check('sticky Pay button visible within the viewport without scrolling', box && box.y + box.height <= vp.height && box.y >= 0, JSON.stringify(box));
            check('Pay button is ≥44px tall', box && box.height >= 44);
        }
        check('no horizontal scroll with the form filled', await noHorizontalScroll(page));
        await shot(page, `checkout-${vp.name}`);
        if (vp.mobile) await shot(page, `checkout-${vp.name}-viewport`, false);

        /* Double tap Pay: exactly one create-checkout request */
        let createRequests = 0;
        page.on('request', (req) => { if (req.url().includes('/payments/guest/create-checkout')) createRequests += 1; });
        await payBtn.dblclick();
        await payOnSquare(page);
        check('double-tapping Pay sent ONE create-checkout request', createRequests === 1, `${createRequests}`);

        await page.getByText('Your order has been placed successfully!').waitFor({ timeout: 60000 });
        check('confirmation page shows the order', true);
        const orderId = (await page.locator('.ocp-meta-value').first().innerText()).trim();
        check('order id shown', /^PHN-/.test(orderId), orderId);
        const link = await page.locator('.ocp-save-link-input').inputValue();
        check('private order link offered (token in the #fragment, not the query)', /\/order-details#t=[A-Za-z0-9_-]{43}$/.test(link) && !link.includes('?'), link);
        check('create-an-account option offered', await page.getByRole('button', { name: 'Create an account' }).isVisible());
        const cartAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pehnawa_cart') || '[]'));
        check('cart cleared after the order', cartAfter.length === 0);
        check('guest checkout state removed from localStorage', await page.evaluate(() => !localStorage.getItem('pehnawa_guestCheckout')));
        check('no horizontal scroll on confirmation', await noHorizontalScroll(page));
        await shot(page, `confirmation-${vp.name}`);

        await page.reload({ waitUntil: 'networkidle' });
        await page.getByText('Your order has been placed successfully!').waitFor({ timeout: 30000 });
        check('refreshing the confirmation page still shows the order', (await page.locator('.ocp-meta-value').first().innerText()).trim() === orderId);

        const trackPage = await context.newPage();
        await trackPage.goto(link, { waitUntil: 'networkidle' });
        await trackPage.locator('.ocp-meta-value').first().waitFor({ timeout: 20000 });
        check('private link opens the order on the order details page', (await trackPage.locator('.ocp-meta-value').first().innerText()).trim() === orderId);
        check('full address visible via the private link', await trackPage.getByText(ADDRESS.street).isVisible());
        check('no horizontal scroll on the order details page', await noHorizontalScroll(trackPage));
        await shot(trackPage, `track-link-${vp.name}`);
        await trackPage.close();

        placed.push({ viewport: vp.name, orderId, email });
        await context.close();
    }

    /* ── Lookup by order number + email, in a fresh browser ── */
    section('Order details lookup (no link)');
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        await page.goto(`${BASE}/order-details`, { waitUntil: 'networkidle' });
        await page.locator('#track-orderId').fill(placed[0].orderId);
        await page.locator('#track-email').fill('wrong@e2e-guest.test');
        await page.getByRole('button', { name: /Find my order/ }).click();
        await page.getByText("couldn't find an order", { exact: false }).waitFor({ timeout: 15000 });
        check('wrong email → generic not-found message', true);
        await page.locator('#track-email').fill(placed[0].email.toUpperCase());
        await page.getByRole('button', { name: /Find my order/ }).click();
        await page.locator('.ocp-meta-value').first().waitFor({ timeout: 15000 });
        check('order number + email finds the order', (await page.locator('.ocp-meta-value').first().innerText()).trim() === placed[0].orderId);
        check('…without the street address', !(await page.getByText(ADDRESS.street).isVisible().catch(() => false)));
        check('no horizontal scroll', await noHorizontalScroll(page));
        await shot(page, 'track-lookup-mobile-390x844');
        await context.close();
    }

    /* ── Signed-in regression ── */
    section('Signed-in customer — saved cart & checkout (desktop)');
    {
        const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx1.newPage();
        await addToCartFromProductPage(page); // add as a visitor first…
        await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
        check('Google sign-in button is gone', !(await page.getByText('Sign in with Google').isVisible().catch(() => false)));
        await page.locator('input[type="email"]').fill(FIXTURE.userEmail);
        await page.locator('input[type="password"]').first().fill(FIXTURE.password);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(`${BASE}/`, { timeout: 20000 });
        await page.waitForTimeout(1500);
        check('…visitor cart merged into the account and cleared from the browser',
            await page.evaluate(() => !localStorage.getItem('pehnawa_cart') || localStorage.getItem('pehnawa_cart') === '[]'));

        /* The cart follows the account to a different browser */
        const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const other = await ctx2.newPage();
        await other.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
        await other.locator('input[type="email"]').fill(FIXTURE.userEmail);
        await other.locator('input[type="password"]').first().fill(FIXTURE.password);
        await other.locator('form button[type="submit"]').click();
        await other.waitForURL(`${BASE}/`, { timeout: 20000 });
        await other.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
        check('cart appears in a second browser after signing in', await other.getByText('Test Kurta', { exact: false }).first().isVisible());
        await ctx2.close();

        await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
        check('no guest banner when signed in', !(await page.getByText('Checking out as a', { exact: false }).isVisible().catch(() => false)));
        check('email pre-filled with the account email', (await page.locator('#email').inputValue()) === FIXTURE.userEmail);
        for (const [id, value] of Object.entries(ADDRESS)) await page.locator(`#${id}`).fill(value);
        await page.locator('#zip').press('Enter');
        const payBtn = page.locator('button[type="submit"]').filter({ hasText: /Pay Now/i });
        await page.waitForFunction(() => {
            const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) => /Pay Now/i.test(b.textContent));
            return btn && !btn.disabled;
        }, null, { timeout: 30000 });
        await payBtn.click();
        await payOnSquare(page);
        await page.getByText('Your order has been placed successfully!').waitFor({ timeout: 60000 });
        const orderId = (await page.locator('.ocp-meta-value').first().innerText()).trim();
        check('signed-in order confirmed', /^PHN-/.test(orderId));
        check('signed-in confirmation shows "View Your Orders", not the guest link', await page.getByRole('button', { name: 'View Your Orders' }).isVisible() && !(await page.locator('.ocp-save-link-input').count()));
        await page.getByRole('button', { name: 'View Your Orders' }).click();
        await page.waitForURL(/\/account/);
        await page.getByText(orderId).first().waitFor({ timeout: 20000 });
        check('order listed in My Orders', true);
        await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
        check('saved cart emptied of the purchased item', await page.getByText(/empty/i).first().isVisible().catch(() => false));
        placed.push({ viewport: 'signed-in', orderId, email: FIXTURE.userEmail });
        await ctx1.close();
    }
} catch (error) {
    failed += 1;
    failures.push(`UNCAUGHT: ${error.message.split('\n')[0]}`);
    console.error('\nUNCAUGHT:', error);
} finally {
    await browser.close();
}

console.log('\nOrders placed:', JSON.stringify(placed));
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) console.log('Failed:\n  - ' + failures.join('\n  - '));
process.exit(failed ? 1 : 0);
