/**
 * The Santa Outfit, product page to placed order on a phone, and its place
 * on `/christmas`. The same shape as tests/santa-costume-with-gift.mjs: the
 * page is built on the same blocks and makes the same promises. What differs
 * is the design slot: it holds a style (Suit or Dress, both red), so this
 * buys the second style to prove the choice, not the default, reaches the
 * order. The site-wide pet/dog/cat check and the old URLs' redirects stay in
 * that test, which lists this page among the ones it reads.
 *
 *   node tests/santa-outfit.mjs
 *
 * What it pins down, because none of it is visible to a type check:
 *   - /christmas lists the outfit after the Santa costume, with its price and
 *     sizes
 *   - the product page's first response: delivery strip, both styles, S–L,
 *     the bundle cards in outfits, no invented size chart (the pending note
 *     instead), no pet, dog or cat in what a shopper reads, and none of the
 *     things these pages must never carry; its one-page checkout answers
 *   - the price and all three sizes fit the first screen
 *   - no size, no sale; picking the Dress brings its photo forward; the
 *     chosen style and size become the cart line, the checkout summary, the
 *     order row and the AddToCart payload, under one event id browser and
 *     server
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SLUG = 'santa-outfit';
const URL_ = `${BASE}/products/${SLUG}`;
const PRICE = '27.99';
const SKU = 'CMP-SO-DRESS-M';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- /christmas, before any JavaScript -----------------------------------------
{
	const res = await fetch(`${BASE}/christmas`);
	const html = await res.text();
	check('/christmas serves', res.status === 200, String(res.status));
	check('it lists the Santa outfit', html.includes(`href="/products/${SLUG}"`));
	check('after the Santa costume, in catalogue order', html.indexOf('href="/products/santa-costume-with-gift"') > -1 && html.indexOf('href="/products/santa-costume-with-gift"') < html.indexOf(`href="/products/${SLUG}"`));
	const card = new RegExp(`<a class="card[^"]*" href="/products/${SLUG}"[\\s\\S]*?</a>`).exec(html)?.[0] ?? '';
	check('its card runs S–L', card.includes('Sizes S–L') && !card.includes('XL'), card.slice(0, 300));
	check('and carries its price', card.includes(`$${PRICE}`));
}

// --- the product page's first response ------------------------------------------
{
	const res = await fetch(URL_);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	check('SSR carries the Christmas delivery strip', /Order by \w+day, Dec \d+ for Christmas delivery to the US/.test(html));
	check('SSR opens on the product: its title is the h1', /<h1[^>]*>[\s\S]{0,200}?Santa Outfit/.test(html));
	check('and it is the only h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('SSR quotes the price', html.includes(`$${PRICE}`));
	check('SSR offers both styles', html.includes('>Santa Suit<') && html.includes('>Santa Dress<') && ['santa_suit', 'santa_dress'].every((d) => html.includes(`value="${d}"`)));
	check('and sizes S to L only', ['S', 'M', 'L'].every((s) => html.includes(`value="${s}"`)) && !html.includes('value="XL"'));
	check('the bundle cards count outfits', /You save 7% with 2 outfits/.test(html) && !/with \d (hoodies|costumes)/.test(html));
	check('og:image is the suit photo, absolute', /property="og:image" content="https?:\/\/[^"]*\/products\/santa-outfit\/suit\.jpg"/.test(html));
	check('the size guide has no table yet', html.includes('id="size-guide"') && !/<th scope="col"[^>]*>(Chest|Neck|Weight)<\/th>/.test(html));
	check('and says the measurements are on their way', html.includes('Measurements for each size are on their way'));
	check('no size is pre-selected', !/name="size"[^>]*checked/.test(html));
	check('no was-price or strikethrough price', !/compare|<s>|<del>/i.test(html.replace(/<style[\s\S]*?<\/style>/g, '')));
	check('no countdown chips, stock bar or viewers', !/sale ends|left in stock|viewing|people are|% sold/i.test(html));
	check('no ratings or reviews', !/★|Pet Parents|What owners are saying/.test(html));
	const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? html;
	// The owner's rule since 2026-10-18: no "pet", "dog" or "cat" in what a
	// shopper reads. Tags and attributes (photo alt text, file names) aside;
	// "ChillMyPet" has no word boundary before "Pet", so it passes.
	const words = main.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ');
	check('the page says no pet, dog or cat', !/\b(pets?|dogs?|cats?|puppy|kitten)\b/i.test(words), /.{0,40}\b(pets?|dogs?|cats?|puppy|kitten)\b.{0,40}/i.exec(words)?.[0]);
	check('no other product’s copy leaked in', !/chin rest|life jacket|antler|reindeer|present in|wrapped gift/i.test(main));
	const checkout = await fetch(`${URL_}/checkout`);
	check('its one-page checkout answers, for an ad that should land on the form', checkout.status === 200, String(checkout.status));
	const header = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
	check('the site header’s Catalog menu links to /christmas and /catalog', header.includes('href="/christmas"') && header.includes('href="/catalog"'));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
await ctx.route('**/facebook.com/tr*', (route) => route.abort());
await ctx.route('**/google.com/g/collect*', (route) => route.abort());
await ctx.route('**/google-analytics.com/**', (route) => route.abort());

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
	if (m.type() !== 'error') return;
	const text = m.text();
	if (text.includes('ERR_FAILED') || text.includes('net::')) return;
	pageErrors.push(`console: ${text}`);
});

const serverCopies = [];
page.on('request', (req) => {
	if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/track') {
		try {
			serverCopies.push(req.postDataJSON());
		} catch {
			/* not JSON — the endpoint would drop it too */
		}
	}
});

const fbqCalls = () => page.evaluate(() => (window.fbq?.queue ?? []).map((a) => Array.from(a)));
const browserEvent = async (name) =>
	(await fbqCalls()).filter((c) => c[0] === 'track' && c[1] === name);
const serverCopy = (name) => serverCopies.filter((b) => b.eventName === name);
const cartLines = () =>
	page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
const bottom = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().bottom);

// --- /christmas on a phone ------------------------------------------------------
{
	await page.goto(`${BASE}/christmas`, { waitUntil: 'networkidle' });
	await page.locator(`a.card[href="/products/${SLUG}"]`).click();
	await page.waitForURL(`**/products/${SLUG}`);
	check('a card leads to its product page', new URL(page.url()).pathname === `/products/${SLUG}`);
}

// Start clean: no cart, no leftover picker state from another page.
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
});
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

// --- the first screen ------------------------------------------------------------
{
	await page.evaluate(() => window.scrollTo(0, 0));
	check('the price is on the first screen', (await bottom('#variant-picker .price')) <= 664);
	const sizes = await page
		.locator('#size-picker label')
		.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
	check('all three sizes are on the first screen', sizes.length === 3 && sizes.every((r) => r.bottom <= 664), JSON.stringify(sizes.map((r) => r.bottom)));
	check('the page opens on the Suit, the listing photo', (await page.locator('#variant-picker input[name="design"]:checked').getAttribute('value')) === 'santa_suit' && (await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/suit.jpg'));
	await page.setViewportSize({ width: 390, height: 844 });
}

// --- ViewContent ------------------------------------------------------------------
{
	const b = await browserEvent('ViewContent');
	check('ViewContent names the product', JSON.stringify(b[0]?.[2]?.content_ids) === `["${SLUG}"]`, JSON.stringify(b[0]?.[2]));
}

// --- no size, no sale -------------------------------------------------------------
{
	await page.locator('#variant-picker button.cta').click();
	await page.locator('#size-error').filter({ hasText: /Pick a size first/ }).waitFor({ timeout: 5000 });
	check('buying without a size stays on the page', page.url().startsWith(URL_));
	check('nothing was added to the cart', (await cartLines()).length === 0);
	check('and no AddToCart was reported', (await browserEvent('AddToCart')).length === 0 && serverCopy('AddToCart').length === 0);
}

// --- pick a size, buy one ---------------------------------------------------------
await page.locator('#variant-picker label.tier', { hasText: 'Two outfits' }).click();
check('two outfits re-price the button', (await page.locator('#variant-picker button.cta').innerText()).includes('$52.06'));
await page.locator('#variant-picker label.tier', { hasText: 'One outfit' }).click();
await page.locator('#variant-picker label', { hasText: 'Santa Dress' }).click();
check('the gallery follows the style', (await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/dress.jpg'));
await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
await page.locator('#variant-picker button', { hasText: /Add to cart/ }).click();
await page.waitForURL('**/checkout', { timeout: 15000 });

{
	const lines = await cartLines();
	check(
		'the cart holds exactly the dress, size M, one of',
		lines.length === 1 && lines[0].colour === 'santa_dress' && lines[0].size === 'M' && lines[0].quantity === 1,
		JSON.stringify(lines)
	);
}

{
	const b = await browserEvent('AddToCart');
	const s = serverCopy('AddToCart');
	const id = b[0]?.[3]?.eventID;
	check('AddToCart fired once in the browser and once to /api/track', b.length === 1 && s.length === 1, `${b.length} / ${s.length}`);
	check('under one event_id', Boolean(id) && s[0]?.eventId === id, `${id} vs ${s[0]?.eventId}`);
	check('AddToCart names the variant by SKU at the price', JSON.stringify(b[0]?.[2]?.content_ids) === `["${SKU}"]` && b[0]?.[2]?.value === PRICE, JSON.stringify(b[0]?.[2]));
}

await page.waitForSelector('.classic-totals');
{
	const summary = await page.locator('.classic-order').innerText();
	check('checkout shows the outfit, the dress, size M', summary.includes('Santa Outfit') && /Santa Dress · Size M/.test(summary), summary.slice(0, 300));
	check(`checkout charges $${PRICE}`, (await page.locator('.classic-totals').innerText()).includes(`$${PRICE}`));
}

await page.fill('#shipping-firstName', 'Mary');
await page.fill('#shipping-lastName', 'Claus');
await page.fill('#contact-email', 'santa-outfit@example.com');
await page.fill('#shipping-address', '751 Pine St');
await page.fill('#shipping-city', 'Austin');
await page.selectOption('#shipping-state', 'TX');
await page.fill('#shipping-zip', '73301');
await page.getByRole('button', { name: /^(Pay |Place order)/ }).click();
await page
	.getByRole('heading', { name: /order received/i })
	.waitFor({ timeout: 20000 })
	.catch(() => {});
const body = (await page.textContent('body')) ?? '';
const orderNumber = /CMP-[0-9A-F]{8}/.exec(body)?.[0];
check('the order was accepted', Boolean(orderNumber), body.slice(0, 300));

{
	const db = createClient({
		url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	});
	const rows = await db.execute({
		sql: `select oi.sku, oi.option1, oi.option2, oi.unit_price_cents, oi.quantity, oi.product_slug
		      from order_items oi join orders o on o.id = oi.order_id
		      where o.order_number = ?`,
		args: [orderNumber ?? '']
	});
	const row = rows.rows[0];
	check(
		'the order line is the dress, size M, at the server price',
		rows.rows.length === 1 &&
			row.sku === SKU &&
			row.option1 === 'santa_dress' &&
			row.option2 === 'M' &&
			Number(row.unit_price_cents) === 2799 &&
			Number(row.quantity) === 1 &&
			row.product_slug === SLUG,
		JSON.stringify(row)
	);
	db.close();
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
