/**
 * The bag's drawer when pricing goes wrong.
 *
 *   node tests/cart-drawer.mjs
 *
 * The drawer re-prices the saved cart through /api/cart each time it opens.
 * It used to show "Loading…" until that answered, and kept showing it when
 * the answer never came: a request that timed out, an error page (Cloudflare's
 * 1101 is HTML, so reading it as JSON throws) or a dropped connection. The
 * owner found it stuck like that on 2026-10-19 with ten items in the bag.
 * What this pins down:
 *   - a failed or broken answer shows a message, the checkout and Try again
 *   - Try again prices the cart once the server answers
 *   - a request that never answers gives up after ten seconds
 *   - a line the server no longer sells (a retired product still saved in
 *     the browser) leaves the cart, so the count matches the lines shown
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
	await drawer.getByRole('alert').waitFor({ timeout: 5000 }).catch(() => {});
	const text = await drawer.innerText();
	check('an error page shows a message, not endless Loading', /couldn't load your cart/i.test(text) && !/Loading/.test(text), text);
	check('it still offers the checkout', (await drawer.locator('a[href="/checkout"]').count()) > 0);
	await drawer.getByRole('button', { name: 'Try again' }).click();
	await drawer.locator('.lines li').first().waitFor({ timeout: 8000 }).catch(() => {});
	const after = await drawer.innerText();
	check('Try again prices the cart once the server answers', after.includes('Christmas Tree Costume') && !/couldn't load/i.test(after), after.slice(0, 200));
	await ctx.close();
}

// --- a dropped connection ---------------------------------------------------------
{
	const { ctx, drawer, openBag } = await visitor([COSTUME], (route) => route.abort('connectionreset'));
	await openBag();
	await drawer.getByRole('alert').waitFor({ timeout: 5000 }).catch(() => {});
	check('a dropped connection shows the message too', /couldn't load your cart/i.test(await drawer.innerText()));
	await ctx.close();
}

// --- a request that never answers ---------------------------------------------------
{
	const { ctx, drawer, openBag } = await visitor([COSTUME], () => {
		// Never fulfilled.
	});
	await openBag();
	await new Promise((r) => setTimeout(r, 3000));
	check('while waiting it says Loading', /Loading/.test(await drawer.innerText()));
	await drawer.getByRole('alert').waitFor({ timeout: 12000 }).catch(() => {});
	check('after ten seconds it gives up and says so', /couldn't load your cart/i.test(await drawer.innerText()));
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

await browser.close();
db.close();
console.log(process.exitCode ? '\nCart drawer check(s) failed.' : '\nThe cart drawer recovers from a failed price.');
