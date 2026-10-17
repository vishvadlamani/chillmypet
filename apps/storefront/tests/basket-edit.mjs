/**
 * Changing the basket at checkout: quantity buttons and Remove on every line.
 *
 *   node tests/basket-edit.mjs
 *
 * The cart lives in the browser for good, so a basket can arrive at a
 * checkout holding what was added on an earlier visit: three life jackets
 * from the summer under a Christmas costume and a reindeer hoodie, which is
 * how the owner found it on 2026-10-17. What this pins down:
 *   - /checkout: each line in the "Your order" box has − n +, Remove, and a
 *     Change link to its own product (not the first line's); the total is
 *     re-priced by the server after each change
 *   - the hoodie's shop checkout: a leftover from another product opens the
 *     phone summary by itself and can be removed there; the hoodie's own line
 *     has quantity buttons but no Remove (the picker owns it), and a count
 *     set there survives a change of size
 *   - the costume's one-page checkout: its own line has neither, because its
 *     bundle cards set the count; the leftover line has both
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

// Real variant ids and prices, read from the store the server prices against.
const db = createClient({
	url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
	authToken: process.env.TURSO_AUTH_TOKEN
});
async function line(sku, quantity) {
	const { rows } = await db.execute({
		sql: `select v.id, p.slug, v.option1, v.option2, v.price_cents
		      from product_variants v join products p on p.id = v.product_id
		      where v.sku = ?`,
		args: [sku]
	});
	const r = rows[0];
	if (!r) throw new Error(`no variant ${sku} — seed the database`);
	return {
		variantId: Number(r.id),
		slug: String(r.slug),
		colour: String(r.option1),
		size: String(r.option2),
		quantity,
		unitPriceCents: Number(r.price_cents)
	};
}
const JACKETS = await line('CMP-LJ-SAILBOAT-L', 3);
const COSTUME = await line('CMP-XT-GREEN-M', 1);
const REINDEER = await line('CMP-XR-RED-M', 1).catch(async () => {
	// The reindeer hoodie's SKU scheme, whatever its prefix: the first M.
	const { rows } = await db.execute(
		"select v.sku from product_variants v join products p on p.id = v.product_id where p.slug = 'reindeer-dog-hoodie' and v.option2 = 'M' limit 1"
	);
	return line(String(rows[0].sku), 1);
});
db.close();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
await ctx.route('**/facebook.com/tr*', (route) => route.abort());
await ctx.route('**/google.com/g/collect*', (route) => route.abort());
await ctx.route('**/google-analytics.com/**', (route) => route.abort());
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

const cartLines = () => page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
async function basket(lines) {
	await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
	await page.evaluate((l) => {
		localStorage.clear();
		sessionStorage.clear();
		localStorage.setItem('chillmypet.cart.v1', JSON.stringify(l));
	}, lines);
}
/** Waits for /api/cart's answer to show, rather than racing it. */
const shows = (locator, pattern) =>
	locator
		.filter({ hasText: pattern })
		.first()
		.waitFor({ timeout: 5000 })
		.then(() => true)
		.catch(() => false);
const qty = (variantId) => cartLines().then((ls) => ls.find((l) => l.variantId === variantId)?.quantity ?? 0);

// --- /checkout: the basket the owner found -------------------------------------------
await basket([JACKETS, COSTUME, REINDEER]);
await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
{
	const box = page.locator('section[aria-label="Your order"]');
	const jacketRow = box.locator('div.flex.items-start', { hasText: 'Dog Life Jacket' });
	check('every line has its own quantity buttons', (await box.getByRole('group', { name: /^Quantity of / }).count()) === 3);
	check('and its own Remove', (await box.getByRole('button', { name: 'Remove' }).count()) === 3);
	const changes = await box.locator('a', { hasText: 'Change' }).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
	check(
		'and a Change link to its own product, not the first line’s',
		JSON.stringify(changes.sort()) === JSON.stringify([`/products/${COSTUME.slug}`, `/products/${JACKETS.slug}`, `/products/${REINDEER.slug}`].sort()),
		JSON.stringify(changes)
	);
	check('the jackets show 3', (await jacketRow.locator('output').innerText()) === '3');

	await jacketRow.getByRole('button', { name: /^One fewer / }).click();
	check('one fewer: the cart holds 2', (await qty(JACKETS.variantId)) === 2);
	check('and the server re-prices the line', await shows(jacketRow, '$' + ((JACKETS.unitPriceCents * 2) / 100).toFixed(2)), await jacketRow.innerText());

	await jacketRow.getByRole('button', { name: /^One fewer / }).click();
	check('the minus stops at 1 rather than emptying the line', (await jacketRow.getByRole('button', { name: /^One fewer / }).isDisabled()) && (await qty(JACKETS.variantId)) === 1);

	await box.locator('div.flex.items-start', { hasText: 'Christmas Tree Costume' }).getByRole('button', { name: /^One more / }).click();
	check('one more costume: the cart holds 2', (await qty(COSTUME.variantId)) === 2);

	await jacketRow.getByRole('button', { name: 'Remove' }).click();
	check('Remove takes the jackets out', (await cartLines()).every((l) => l.slug !== JACKETS.slug));
	// The server's figure for what is left, quantity break included: the
	// page must show that, never a sum of its own.
	const priced = await (
		await fetch(`${BASE}/api/cart`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lines: (await cartLines()).map((l) => ({ variantId: l.variantId, quantity: l.quantity })) })
		})
	).json();
	const expected = ((priced.subtotalCents - priced.discountCents) / 100).toFixed(2);
	check('and the total is the server’s price for what is left', await shows(box, `Total: $${expected}`), await box.innerText());
	const shown = await page.locator('form[method="POST"]:not([action]) button[type="submit"]').innerText();
	check('the pay button agrees', shown.includes(expected) || /Place order/.test(shown), shown);
}

// --- the hoodie's shop checkout, with a jacket left over ----------------------------------
await basket([JACKETS]);
await page.goto(`${BASE}/products/christmas-pouch-hoodie/checkout?design=red_santa&size=M&added=1`, { waitUntil: 'networkidle' });
{
	const folded = page.locator('#shop-summary-folded');
	check('a leftover from another product opens the phone summary by itself', await folded.isVisible());
	check('so the buyer sees it before paying', /Dog Life Jacket/.test(await folded.innerText()));
	const hoodieRow = folded.locator('li', { hasText: 'Christmas Pouch Hoodie' });
	const jacketRow = folded.locator('li', { hasText: 'Dog Life Jacket' });
	check('the hoodie has quantity buttons', (await hoodieRow.getByRole('group').count()) === 1);
	check('but no Remove: its picker is the way to change it', (await hoodieRow.getByRole('button', { name: 'Remove' }).count()) === 0);
	await jacketRow.getByRole('button', { name: 'Remove' }).click();
	check('the jacket can be removed', (await cartLines()).every((l) => l.slug !== JACKETS.slug));
	check('leaving the hoodie at its price', await shows(page.locator('button.shop-pay'), 'Pay $54.99'));

	await hoodieRow.getByRole('button', { name: /^One more / }).click();
	check('two hoodies', (await cartLines()).find((l) => l.slug === 'christmas-pouch-hoodie')?.quantity === 2);
	await page.locator('#variant-picker button', { hasText: 'Change' }).click();
	await page.locator('#size-picker label').filter({ hasText: /^\s*L\s*$/ }).click();
	await page.waitForLoadState('networkidle');
	const lines = await cartLines();
	check('a change of size keeps the count', lines.length === 1 && lines[0].size === 'L' && lines[0].quantity === 2, JSON.stringify(lines));
}

// --- the costume's one-page checkout: the bundle cards own its count -------------------------
await basket([JACKETS]);
await page.goto(`${BASE}/products/${COSTUME.slug}/checkout`, { waitUntil: 'networkidle' });
await page.locator('#variant-picker label', { hasText: 'Green' }).click();
await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
await page.waitForLoadState('networkidle');
{
	const form = page.locator('form[method="POST"]:not([action])');
	const costumeRow = form.locator('li', { hasText: 'Christmas Tree Costume' });
	const jacketRow = form.locator('li', { hasText: 'Dog Life Jacket' });
	await costumeRow.waitFor({ timeout: 5000 }).catch(() => {});
	check('the costume line has no quantity buttons or Remove', (await costumeRow.getByRole('group').count()) === 0 && (await costumeRow.getByRole('button', { name: 'Remove' }).count()) === 0);
	check('it says its count instead', /Qty 1/.test(await costumeRow.innerText()), await costumeRow.innerText());
	check('the leftover jackets have both', (await jacketRow.getByRole('group').count()) === 1 && (await jacketRow.getByRole('button', { name: 'Remove' }).count()) === 1);
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}
await browser.close();
