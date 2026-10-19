/**
 * The bag's drawer when pricing goes wrong.
 *
 *   node tests/cart-drawer.mjs
 *
 * The drawer re-prices the saved cart through /api/cart each time it opens.
 * It used to show "Loading…" until that answered, so a slow or broken answer
 * (a timeout, an error page such as Cloudflare's 1101, a dropped connection)
 * left a full bag that could not be changed. The owner found it stuck like
 * that twice on 2026-10-19, with ten and then twelve items in the bag.
 * What this pins down:
 *   - the lines, − + and Remove are there at once, before the server answers,
 *     and work while it never does
 *   - a failed or broken answer leaves the lines and adds a note with Try
 *     again; Try again prices the cart once the server answers
 *   - a request that never answers gives up after ten seconds
 *   - a line the server no longer sells (a retired product still saved in
 *     the browser) leaves the cart, so the count matches the lines shown
 *   - /checkout says it couldn't load the cart, with Try again, rather than
 *     "Loading…" for good or an empty cart
 *   - a cart holding one variant twice (an old slug and a new one) is mended
 *     to one line, and the pages keep responding
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

const db = createClient({
	url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
	authToken: process.env.TURSO_AUTH_TOKEN
});
const { rows } = await db.execute(
	`select v.id, p.slug, v.option1, v.option2, v.price_cents
	 from product_variants v join products p on p.id = v.product_id
	 where v.sku = 'CMP-XT-GREEN-M'`
);
if (!rows[0]) throw new Error('no CMP-XT-GREEN-M variant — seed the database');
const COSTUME = {
	variantId: Number(rows[0].id),
	slug: String(rows[0].slug),
	colour: String(rows[0].option1),
	size: String(rows[0].option2),
	quantity: 3,
	unitPriceCents: Number(rows[0].price_cents)
};
const second = await db.execute(
	`select v.id, v.option2 from product_variants v where v.sku = 'CMP-XT-GREEN-L'`
);
if (!second.rows[0]) throw new Error('no CMP-XT-GREEN-L variant — seed the database');
const SECOND = { variantId: Number(second.rows[0].id), size: String(second.rows[0].option2) };
// No variant has this id: a product taken off sale since it was added.
const RETIRED = { variantId: 987654, slug: 'christmas-pouch-hoodie', colour: 'red', size: 'M', quantity: 7, unitPriceCents: 5499 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/** A desktop visitor whose browser already holds `lines`, with /api/cart answered by `pricing`. */
async function visitor(lines, pricing) {
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	for (const pattern of ['**/connect.facebook.net/**', '**/facebook.com/tr*', '**/google.com/g/collect*', '**/google-analytics.com/**', '**/googletagmanager.com/**', '**/api/track*'])
		await ctx.route(pattern, (route) => route.abort());
	await ctx.addInitScript((saved) => localStorage.setItem('chillmypet.cart.v1', JSON.stringify(saved)), lines);
	if (pricing) await ctx.route('**/api/cart', pricing);
	const page = await ctx.newPage();
	await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
	const drawer = page.locator('dialog.cart-drawer');
	const openBag = async () => {
		await page.locator('header.site-header a[href="/checkout"]').first().click();
		await drawer.waitFor({ state: 'visible' });
	};
	return { ctx, page, drawer, openBag };
}

// --- an error page ---------------------------------------------------------------
{
	let calls = 0;
	const { ctx, drawer, openBag } = await visitor([COSTUME], (route) => {
		calls += 1;
		if (calls === 1) return route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Error 1101</h1>' });
		return route.continue();
	});
	await openBag();
	await drawer.locator('.note').waitFor({ timeout: 5000 }).catch(() => {});
	const text = await drawer.innerText();
	check('an error page leaves the lines and says prices could not be checked', /couldn't check prices/i.test(text) && (await drawer.locator('.lines li').count()) === 1 && !/Loading/.test(text), text);
	check('it still offers the checkout', (await drawer.locator('a[href="/checkout"]').count()) > 0);
	await drawer.getByRole('button', { name: 'Try again' }).click();
	await drawer.locator('.lines li img').first().waitFor({ timeout: 8000 }).catch(() => {});
	const after = await drawer.innerText();
	check('Try again prices the cart once the server answers', after.includes('Christmas Tree Costume') && !/couldn't check/i.test(after), after.slice(0, 200));
	await ctx.close();
}

// --- a dropped connection ---------------------------------------------------------
{
	const { ctx, drawer, openBag } = await visitor([COSTUME], (route) => route.abort('connectionreset'));
	await openBag();
	await drawer.locator('.note').waitFor({ timeout: 5000 }).catch(() => {});
	check('a dropped connection shows the note too', /couldn't check prices/i.test(await drawer.innerText()));
	await ctx.close();
}

// --- a request that never answers ---------------------------------------------------
{
	const { ctx, page, drawer, openBag } = await visitor([COSTUME, { ...COSTUME, variantId: SECOND.variantId, size: SECOND.size, quantity: 2 }], () => {
		// Never fulfilled.
	});
	await openBag();
	await page.waitForTimeout(500);
	const text = await drawer.innerText();
	check('the lines are there at once, with no Loading', (await drawer.locator('.lines li').count()) === 2 && !/Loading/.test(text), text);
	await drawer.locator('.lines li').nth(0).getByRole('button', { name: /one more/i }).click();
	await drawer.locator('.lines li').nth(1).getByRole('button', { name: 'Remove' }).click();
	await page.waitForTimeout(300);
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
	const heading = await drawer.locator('h2').innerText();
	check('+ and Remove work while the server says nothing', saved.length === 1 && saved[0].quantity === 4 && /\(4\)/.test(heading), `${heading} ${JSON.stringify(saved)}`);
	await drawer.locator('.note').waitFor({ timeout: 12000 }).catch(() => {});
	check('after ten seconds it gives up and says so', /couldn't check prices/i.test(await drawer.innerText()));
	await ctx.close();
}

// --- the checkout page -------------------------------------------------------------
{
	let calls = 0;
	const { ctx, page } = await visitor([COSTUME], (route) => {
		calls += 1;
		if (calls === 1) return route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Error 1101</h1>' });
		return route.continue();
	});
	await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
	const alert = page.getByRole('alert').filter({ hasText: /couldn't load your cart/i });
	await alert.first().waitFor({ timeout: 5000 }).catch(() => {});
	const body = await page.locator('body').innerText();
	check('/checkout says it could not load the cart, not that it is empty', (await alert.count()) > 0 && !/Your cart is empty/i.test(body), body.slice(0, 300));
	await alert.first().getByRole('button', { name: 'Try again' }).click();
	await page.getByText('Christmas Tree Costume').first().waitFor({ timeout: 8000 }).catch(() => {});
	check('and Try again brings the lines', (await page.getByText('Christmas Tree Costume').count()) > 0);
	await ctx.close();
}

// --- a product taken off sale -----------------------------------------------------
{
	const { ctx, page, drawer, openBag } = await visitor([COSTUME, RETIRED]);
	check('the bag starts by counting the retired line', (await page.locator('header.site-header').innerText()).includes('10'));
	await openBag();
	await drawer.locator('.lines li').first().waitFor({ timeout: 8000 });
	await page.waitForTimeout(1000);
	const heading = await drawer.locator('h2').innerText();
	check('the retired line leaves the cart, so the count matches', /\(3\)/.test(heading) && (await drawer.locator('.lines li').count()) === 1, heading);
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
	check('and the browser no longer saves it', saved.length === 1 && saved[0].variantId === COSTUME.variantId, JSON.stringify(saved));
	await ctx.close();
}

// --- the same variant saved twice, under an old slug and the new one ------------------
// What the owner's browser held on 2026-10-19: the costume carted before its
// renames (`dog-christmas-costume`) and again since. Two lines with one
// variant made every list keyed by variant throw `each_key_duplicate`, and the
// throw left the product page's colours, sizes, bundles and photos dead.
{
	const OLD = { ...COSTUME, slug: 'dog-christmas-costume', quantity: 1 };
	const NEW = { ...COSTUME, quantity: 1 };
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
	for (const pattern of ['**/connect.facebook.net/**', '**/facebook.com/tr*', '**/google.com/g/collect*', '**/google-analytics.com/**', '**/googletagmanager.com/**', '**/api/track*'])
		await ctx.route(pattern, (route) => route.abort());
	await ctx.addInitScript((saved) => {
		if (!sessionStorage.getItem('seeded')) {
			localStorage.setItem('chillmypet.cart.v1', JSON.stringify(saved));
			sessionStorage.setItem('seeded', '1');
		}
	}, [OLD, NEW]);
	const page = await ctx.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`${BASE}/products/${COSTUME.slug}`, { waitUntil: 'networkidle' });
	const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
	check('a cart holding one variant twice is mended to one line on load', saved.length === 1 && saved[0].quantity === 2, JSON.stringify(saved));
	await page.locator('#variant-picker label', { hasText: 'Red' }).click();
	await page.waitForTimeout(500);
	check('the product page still responds: Red brings the red photo', (await page.locator('.gallery .frame img').getAttribute('src'))?.includes('red'), await page.locator('.gallery .frame img').getAttribute('src'));
	await page.locator('header.site-header a[href="/checkout"]').first().click();
	const drawer = page.locator('dialog.cart-drawer');
	await drawer.waitFor({ state: 'visible' });
	check('the bag shows it once, as two', (await drawer.locator('.lines li').count()) === 1 && /\(2\)/.test(await drawer.locator('h2').innerText()));
	// Its one-page checkout must not put the variant back twice either.
	await page.goto(`${BASE}/products/${COSTUME.slug}/checkout?design=${COSTUME.colour}&size=${COSTUME.size}`, { waitUntil: 'networkidle' });
	await page.waitForTimeout(1500);
	const after = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
	check('its payment page keeps one line for that variant', after.filter((l) => l.variantId === after[0]?.variantId).length === 1 && after.length === 1, JSON.stringify(after));
	check('and nothing threw', errors.length === 0, errors.join(' | '));
	await ctx.close();
}
{
	const res = await fetch(`${BASE}/api/cart`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: BASE },
		body: JSON.stringify({ lines: [{ variantId: COSTUME.variantId, quantity: 1 }, { variantId: COSTUME.variantId, quantity: 2 }] })
	});
	const body = await res.json();
	check('/api/cart answers one line per variant, quantities added', body.lines?.length === 1 && body.lines[0].quantity === 3, JSON.stringify(body.lines));
}

await browser.close();
db.close();
console.log(process.exitCode ? '\nCart drawer check(s) failed.' : '\nThe cart drawer recovers from a failed price.');
