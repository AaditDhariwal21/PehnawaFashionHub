/**
 * End-to-end regression check for the admin Edit Product → Variants editor.
 *
 * Covers the two defects the variant editor shipped with:
 *
 *   BUG 1  Adding a size fanned out to EVERY color instead of the one the
 *          admin was acting on, leaving blank stock/price rows on colors the
 *          admin never touched — which then blocked Save with an error the
 *          admin had no way to explain.
 *
 *   BUG 2  Deleting a (color, size) combination was not authoritative: the
 *          deletion lived only as an absence from a derived color × size
 *          matrix, so the next color/image or size edit silently re-created
 *          the row, and the deletion never reached the save payload.
 *
 * The script asserts the CORRECT behaviour. Run it against the buggy code and
 * it fails, printing "BUG n REPRODUCED" with what it actually observed; run it
 * against the fixed code and every check passes.
 *
 * Prerequisites (local/dev only — never point this at production):
 *   1. A local MongoDB, a backend on :5000 and `npm run dev` on :5173.
 *   2. An admin user and a product with 2 colors × 2 sizes. Defaults below
 *      match scripts/seedVariantFixture — override with env vars.
 *
 * Usage:  node e2e/variant-editor.mjs [--headed] [--slow]
 */

import { chromium } from 'playwright';

/* ── Config ──────────────────────────────────────────────────── */

const CFG = {
    baseUrl: process.env.E2E_BASE_URL || 'http://localhost:5173',
    apiUrl: process.env.E2E_API_URL || 'http://localhost:5000/api',
    email: process.env.E2E_ADMIN_EMAIL || 'admin@local.test',
    password: process.env.E2E_ADMIN_PASSWORD || 'LocalAdmin123!',
    productName: process.env.E2E_PRODUCT_NAME || 'Variant Test Kurta',
};

const headed = process.argv.includes('--headed');
const slowMo = process.argv.includes('--slow') ? 350 : 0;

/* The fixture every scenario starts from: 2 colors × 2 sizes, all populated. */
const BASELINE = [
    { color: 'Red', size: 'S', price: 50, stock: 5 },
    { color: 'Red', size: 'M', price: 55, stock: 6 },
    { color: 'Blue', size: 'S', price: 60, stock: 7 },
    { color: 'Blue', size: 'M', price: 65, stock: 8 },
];

/* ── Tiny assertion harness ──────────────────────────────────── */

const results = [];
let currentBug = null;

const check = (name, condition, detail = '') => {
    results.push({ name, ok: !!condition, detail, bug: currentBug });
    const mark = condition ? '  ✓' : '  ✗';
    console.log(`${mark} ${name}${detail ? `\n      ${detail}` : ''}`);
    if (!condition && currentBug) {
        console.log(`      → BUG ${currentBug} REPRODUCED`);
    }
};

const scenario = async (bug, title, fn) => {
    currentBug = bug;
    console.log(`\n── BUG ${bug}: ${title} ──`);
    try {
        await fn();
    } catch (err) {
        check(`${title} (unexpected error)`, false, err.message);
    }
    currentBug = null;
};

/* ── API helpers ─────────────────────────────────────────────── */

const api = async (path, init = {}) => {
    const res = await fetch(`${CFG.apiUrl}${path}`, init);
    const json = await res.json().catch(() => ({}));
    return { res, json };
};

const login = async () => {
    const { json } = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: CFG.email, password: CFG.password }),
    });
    if (!json.success) throw new Error(`Admin login failed: ${json.message}`);
    return { token: json.token, user: json.user };
};

const fetchProduct = async () => {
    const { json } = await api('/products');
    const product = (json.products || []).find((p) => p.name === CFG.productName);
    if (!product) throw new Error(`Fixture product "${CFG.productName}" not found.`);
    return product;
};

/** Put the fixture back to BASELINE so the script is re-runnable. */
const resetProduct = async (token) => {
    const p = await fetchProduct();
    const { json } = await api(`/products/${p._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
            name: p.name,
            shortDescription: p.shortDescription,
            description: p.description,
            price: p.price,
            gender: p.gender,
            category: p.category,
            weight: p.weight,
            specialTags: p.specialTags || [],
            isCategoryCover: false,
            images: p.colors[0].images,
            colors: p.colors,
            variants: BASELINE,
        }),
    });
    if (!json.success) throw new Error(`Reset failed: ${json.message}`);
    return json.product;
};

/* ── Page helpers ────────────────────────────────────────────── */

const gotoManageProducts = async (page, auth) => {
    await page.addInitScript(
        ([user, token]) => {
            localStorage.setItem('user', user);
            localStorage.setItem('token', token);
        },
        [JSON.stringify(auth.user), auth.token]
    );
    await page.goto(`${CFG.baseUrl}/admin/manage-products`, { waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor({ timeout: 15000 });
};

const openEditModal = async (page) => {
    await page.getByText(CFG.productName).first().click();
    await page.getByRole('heading', { name: 'Edit Product' }).waitFor({ timeout: 10000 });
    await page.getByText('Each color × size combination').waitFor({ timeout: 10000 });
};

const closeModalIfOpen = async (page) => {
    const heading = page.getByRole('heading', { name: 'Edit Product' });
    if (await heading.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Cancel' }).click();
        await heading.waitFor({ state: 'hidden', timeout: 5000 });
    }
};

/**
 * Read the variant matrix out of the DOM.
 * Returns [{ color, size, price, stock, removed }].
 */
const readMatrix = (page) =>
    page.evaluate(() => {
        const heading = [...document.querySelectorAll('p')].find((el) =>
            el.textContent.trim().startsWith('Variants')
        );
        const panel = heading?.closest('div.bg-gray-50');
        const table = panel?.querySelector('table');
        if (!table) return [];
        return [...table.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.children];
            const inputs = tr.querySelectorAll('input[type="number"]');
            return {
                color: cells[0]?.textContent.trim() || '',
                size: cells[1]?.textContent.trim() || '',
                removed: tr.textContent.includes('Combination removed'),
                price: inputs[0]?.value ?? null,
                stock: inputs[1]?.value ?? null,
            };
        });
    });

/** Rows actually present as editable variants (not "removed" placeholders). */
const liveRows = (matrix) => matrix.filter((r) => !r.removed);

const rowFor = (matrix, color, size) =>
    matrix.find((r) => r.color === color && r.size === size) || null;

const fmt = (matrix) =>
    matrix
        .map((r) => (r.removed ? `${r.color}/${r.size}:removed` : `${r.color}/${r.size}:${r.stock}@${r.price}`))
        .join(', ') || '(empty)';

/**
 * Does the UI offer a way to scope "add size" to a specific color?
 * The fix introduces a per-color size control; the buggy version had only a
 * global size axis.
 */
const hasColorScopedAddSize = async (page) => {
    const picker = page.locator('[data-testid="add-size-color"]');
    return (await picker.count()) > 0;
};

const addSizeForColor = async (page, color, size) => {
    await page.locator('[data-testid="add-size-color"]').selectOption(color);
    const input = page.locator('[data-testid="add-size-input"]');
    await input.fill(size);
    await page.locator('[data-testid="add-size-submit"]').click();
};

/** Buggy-era global add: click the preset size chip, no color choice at all. */
const addSizeGlobally = async (page, size) => {
    const preset = page.getByRole('button', { name: `+ ${size}`, exact: true });
    if (await preset.count()) {
        await preset.first().click();
        return;
    }
    const input = page.getByPlaceholder(/Custom size/i);
    await input.fill(size);
    await input.press('Enter');
};

const deleteRow = async (page, color, size) => {
    const row = page.locator('tbody tr').filter({
        has: page.locator(`td:text-is("${color}")`),
    }).filter({
        has: page.locator(`td:text-is("${size}")`),
    });
    await row.first().locator('button[title="Remove this combination"]').click();
};

const save = async (page) => {
    await page.getByRole('button', { name: /Save Changes/i }).click();
    // Either the modal closes (success) or an inline error appears.
    const heading = page.getByRole('heading', { name: 'Edit Product' });
    const start = Date.now();
    while (Date.now() - start < 15000) {
        if (!(await heading.isVisible().catch(() => false))) return { ok: true, error: '' };
        const err = await readError(page);
        if (err) return { ok: false, error: err };
        await page.waitForTimeout(150);
    }
    return { ok: false, error: '(save neither closed the modal nor showed an error)' };
};

const readError = (page) =>
    page.evaluate(() => {
        const el = document.querySelector('.bg-red-50 p.text-red-600');
        return el ? el.textContent.trim() : '';
    });

/* ── Scenarios ───────────────────────────────────────────────── */

const bug1 = async (page, auth) => {
    await resetProduct(auth.token);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor();
    await openEditModal(page);

    const scoped = await hasColorScopedAddSize(page);
    check(
        'Add-size control lets the admin pick which color it applies to',
        scoped,
        scoped ? '' : 'No color picker next to the size input — a new size can only be added globally.'
    );

    if (!scoped) {
        // Buggy era: demonstrate the fan-out and the resulting blocked save.
        await addSizeGlobally(page, 'XL');
        const matrix = await readMatrix(page);
        const redXL = rowFor(matrix, 'Red', 'XL');
        const blueXL = rowFor(matrix, 'Blue', 'XL');

        check(
            'Adding a size does not create rows on colors the admin never selected',
            !(redXL && blueXL),
            `matrix after adding XL: ${fmt(matrix)}`
        );

        // Fill in only the color the admin cared about, as the repro describes.
        const redRow = page.locator('tbody tr').filter({ has: page.locator('td:text-is("Red")') })
            .filter({ has: page.locator('td:text-is("XL")') }).first();
        await redRow.locator('input[type="number"]').nth(0).fill('70');
        await redRow.locator('input[type="number"]').nth(1).fill('3');

        const saved = await save(page);
        check(
            'Save is not blocked by rows the admin never asked for',
            saved.ok,
            saved.ok ? '' : `save blocked: "${saved.error}"`
        );
        await closeModalIfOpen(page);
        return;
    }

    /* Fixed era: add XL to Red only. */
    await addSizeForColor(page, 'Red', 'XL');
    let matrix = await readMatrix(page);

    check(
        'XL row created for the selected color (Red)',
        !!rowFor(matrix, 'Red', 'XL') && !rowFor(matrix, 'Red', 'XL').removed,
        `matrix: ${fmt(matrix)}`
    );
    check(
        'XL row NOT created for the unselected color (Blue)',
        !liveRows(matrix).some((r) => r.color === 'Blue' && r.size === 'XL'),
        `matrix: ${fmt(matrix)}`
    );
    check(
        'Existing Blue variants left untouched',
        liveRows(matrix).some((r) => r.color === 'Blue' && r.size === 'S' && r.stock === '7') &&
        liveRows(matrix).some((r) => r.color === 'Blue' && r.size === 'M' && r.stock === '8'),
        `matrix: ${fmt(matrix)}`
    );

    /* Duplicate guard: adding Red/XL again must not create a second row. */
    await addSizeForColor(page, 'Red', 'XL');
    matrix = await readMatrix(page);
    const dupes = liveRows(matrix).filter((r) => r.color === 'Red' && r.size === 'XL').length;
    check('Re-adding the same color+size does not duplicate it', dupes === 1, `Red/XL rows: ${dupes}`);

    /* Fill Red/XL and save — nothing on Blue should block it. */
    const redXLRow = page.locator('tbody tr')
        .filter({ has: page.locator('td:text-is("Red")') })
        .filter({ has: page.locator('td:text-is("XL")') })
        .first();
    await redXLRow.locator('input[type="number"]').nth(0).fill('70');
    await redXLRow.locator('input[type="number"]').nth(1).fill('3');

    const saved = await save(page);
    check(
        'Save succeeds after filling only the color the admin acted on',
        saved.ok,
        saved.ok ? '' : `save blocked: "${saved.error}"`
    );

    const fresh = await fetchProduct();
    const persisted = fresh.variants.map((v) => `${v.color}/${v.size}`).sort().join(',');
    check(
        'Persisted variants contain Red/XL and no Blue/XL',
        persisted === 'Blue/M,Blue/S,Red/M,Red/S,Red/XL',
        `persisted: ${persisted}`
    );
    await closeModalIfOpen(page);
};

const bug2 = async (page, auth) => {
    await resetProduct(auth.token);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor();
    await openEditModal(page);

    /* 1. Delete Red / M. */
    await deleteRow(page, 'Red', 'M');
    let matrix = await readMatrix(page);
    check(
        'Deleted combination disappears from the editor',
        !liveRows(matrix).some((r) => r.color === 'Red' && r.size === 'M'),
        `matrix: ${fmt(matrix)}`
    );

    /* 2. Keep editing after the delete. Any color/image or size edit used to
          regenerate the full color × size matrix and silently resurrect the
          deleted row as a blank (0/0) variant. */
    const colorInput = page.getByPlaceholder(/Add a color/i);
    await colorInput.fill('Green');
    await colorInput.press('Enter');
    await page.locator('button[title=\'Remove "Green"\']').waitFor({ timeout: 5000 });

    matrix = await readMatrix(page);
    check(
        'Deletion survives an unrelated color edit (not resurrected as a blank row)',
        !liveRows(matrix).some((r) => r.color === 'Red' && r.size === 'M'),
        `matrix after adding a color: ${fmt(matrix)}`
    );

    /* Drop the scratch color again so the save payload stays clean. */
    await page.locator('button[title=\'Remove "Green"\']').click();

    /* 3. Save. */
    const saved = await save(page);
    check(
        'Save succeeds after deleting a variant',
        saved.ok,
        saved.ok ? '' : `save blocked: "${saved.error}"`
    );

    /* 4. The deletion is authoritative on the server. */
    const fresh = await fetchProduct();
    const ghost = fresh.variants.find((v) => v.color === 'Red' && v.size === 'M');
    check(
        'Deleted variant is absent from persisted data (not back as 0/0)',
        !ghost,
        ghost
            ? `Red/M came back as stock=${ghost.stock}, price=${ghost.price}`
            : `persisted: ${fresh.variants.map((v) => `${v.color}/${v.size}`).join(', ')}`
    );

    /* 5. Reopen the dialog: the combination must not be back as an editable row. */
    await closeModalIfOpen(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor();
    await openEditModal(page);

    matrix = await readMatrix(page);
    const reopened = liveRows(matrix).find((r) => r.color === 'Red' && r.size === 'M');
    check(
        'Reopening the dialog does not bring the deleted variant back',
        !reopened,
        reopened
            ? `Red/M present again with stock=${reopened.stock}, price=${reopened.price}`
            : `matrix: ${fmt(matrix)}`
    );
    await closeModalIfOpen(page);
};

/**
 * An incomplete variant can still be created deliberately (add a size, don't
 * fill it in). When it is, Save must name the exact row rather than block with
 * something generic.
 */
const incompleteVariantMessage = async (page, auth) => {
    console.log('\n── UX: save error names the incomplete row ──');
    await resetProduct(auth.token);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor();
    await openEditModal(page);

    await addSizeForColor(page, 'Red', 'XL');
    const saved = await save(page);
    check('Save is blocked while a variant is incomplete', !saved.ok, `error: "${saved.error}"`);
    check(
        'Error names the offending color / size',
        /Red \/ XL/.test(saved.error),
        `error: "${saved.error}"`
    );
    check(
        'Error names the missing fields',
        /missing .*(stock|price)/.test(saved.error),
        `error: "${saved.error}"`
    );
    check(
        'Error does not mention colors the admin never touched',
        !/Blue/.test(saved.error),
        `error: "${saved.error}"`
    );

    /* The offending row is also flagged in the table. */
    const flagged = await page.locator('[data-testid="variant-row-Red-XL"]').count();
    check('Incomplete row is still present to be fixed', flagged === 1, `rows found: ${flagged}`);

    await closeModalIfOpen(page);
};

/* Size editing must stay unsupported: delete + add are the only routes. */
const noInPlaceSizeEditing = async (page, auth) => {
    console.log('\n── INVARIANT: variant size is not directly editable ──');
    await resetProduct(auth.token);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByText(CFG.productName).first().waitFor();
    await openEditModal(page);

    const editableSizeCells = await page.evaluate(() => {
        const heading = [...document.querySelectorAll('p')].find((el) =>
            el.textContent.trim().startsWith('Variants')
        );
        const table = heading?.closest('div.bg-gray-50')?.querySelector('table');
        if (!table) return -1;
        return [...table.querySelectorAll('tbody tr')].filter((tr) => {
            const sizeCell = tr.children[1];
            return sizeCell && sizeCell.querySelector('input, select, [contenteditable="true"]');
        }).length;
    });
    check(
        'No input/select in the Size column of any variant row',
        editableSizeCells === 0,
        `rows with an editable size cell: ${editableSizeCells}`
    );
    await closeModalIfOpen(page);
};

/* ── Runner ──────────────────────────────────────────────────── */

const main = async () => {
    console.log(`Variant editor E2E — ${CFG.baseUrl} (api ${CFG.apiUrl})`);
    const auth = await login();
    if (auth.user.role !== 'admin') throw new Error('Fixture user is not an admin.');

    const browser = await chromium.launch({ headless: !headed, slowMo });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', (e) => console.log(`   [page error] ${e.message}`));

    try {
        await gotoManageProducts(page, auth);
        await scenario(1, 'adding a size must not fan out to every color', () => bug1(page, auth));
        await scenario(2, 'deleting a variant must persist', () => bug2(page, auth));
        await incompleteVariantMessage(page, auth);
        await noInPlaceSizeEditing(page, auth);
    } finally {
        await browser.close();
        await resetProduct(auth.token).catch(() => { });
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${'='.repeat(64)}`);
    console.log(`${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
        const bugs = [...new Set(failed.map((r) => r.bug).filter(Boolean))];
        if (bugs.length) console.log(`Reproduced bug(s): ${bugs.join(', ')}`);
        failed.forEach((r) => console.log(`  FAIL  ${r.name}`));
        process.exitCode = 1;
    } else {
        console.log('All variant-editor checks passed.');
    }
};

main().catch((err) => {
    console.error(`\nFATAL: ${err.message}`);
    process.exitCode = 1;
});
