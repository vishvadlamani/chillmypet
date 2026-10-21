/**
 * The Calming Massager, product page to placed order on a phone, and its place
 * in the shop. The first product with one size, and the first product that
 * is not for Christmas built on the Christmas pages' blocks (the life jacket
 * has blocks of its own), so this pins what those two change:
 * the picker shows no size buttons and Add to cart works without a size tap,
 * and the page wears the brand skin, not the Christmas one.
 *
 *   node tests/calming-massager.mjs
 *
 * What it pins down, because none of it is visible to a type check:
 *   - /catalog and / list it (it is not Christmas, so /christmas does not),
 *     with "One size", its price and "Shop now", never "Choose a size"
 *   - the product page's first response: brand skin, both colours, no size
 *     buttons and no size guide, the bundle cards in massagers, no pet, dog
 *     or cat in what a shopper reads, none of the things these pages must
 *     never carry; its one-page checkout answers
 *   - the price, both colours and Add to cart fit the first screen
 *   - picking Black brings its photo forward, and one tap of Add to cart puts
 *     the black massager in the cart, on the checkout summary, the order row
 *     and the AddToCart payload, under one event id browser and server
 *   - a size remembered from another product's page does not get in the way
 *   - Add to cart opens its own payment page, not /checkout, and that page
 *     fills the cart without a size tap
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SLUG = 'calming-massager';
const URL_ = `${BASE}/products/${SLUG}`;
const PRICE = '57.99';
const SKU = 'CMP-MS-BLACK';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- the collections, before any JavaScript --------------------------------------
for (const path of ['/catalog', '/']) {
	const res = await fetch(`${BASE}${path}`);
	const html = await res.text();
	check(`${path} serves`, res.status === 200, String(res.status));
	const card = new RegExp(`<a class="card[^"]*" href="/products/${SLUG}"[\\s\\S]*?</a>`).exec(html)?.[0] ?? '';
	check(`${path} lists the massager`, Boolean(card));
	check('its card says one size and its price', card.includes('One size') && !card.includes('Sizes') && card.includes(`$${PRICE}`), card.slice(0, 400));
	check('and offers to shop, not to choose a size', card.includes('Shop now') && !card.includes('Choose a size'));
}
{
	const html = await (await fetch(`${BASE}/christmas`)).text();
	check('/christmas does not list it', !html.includes(`href="/products/${SLUG}"`));
}

// --- the product page's first response ------------------------------------------
{
	const res = await fetch(URL_);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	// The page carries this request's event ids and this build's script names:
	// a copy the browser keeps would resend one and, after a deploy, load none.
	check('browsers are told not to keep the page', res.headers.get('cache-control') === 'no-store', String(res.headers.get('cache-control')));
	check('SSR opens on the product: its title is the h1', /<h1[^>]*>[\s\S]{0,200}?Calming Massager/.test(html));
	check('and it is the only h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('it wears the brand skin, not Christmas', /class="[^"]*brand-skin/.test(html));
	check('SSR quotes the price', html.includes(`$${PRICE}`));
	check('SSR offers both colours', html.includes('>Khaki<') && html.includes('>Black<') && ['khaki', 'black'].every((d) => html.includes(`value="${d}"`)));
	check('and no size buttons', !html.includes('name="size"') && !html.includes('id="size-picker"'));
	check('nor a size guide', !html.includes('id="size-guide"'));
	check('the bundle cards count massagers', /You save 7% with 2 massagers/.test(html));
	check('og:image is the khaki photo, absolute', /property="og:image" content="https?:\/\/[^"]*\/products\/calming-massager\/khaki\.jpg"/.test(html));
	check('no was-price or strikethrough price', !/compare|<s>|<del>/i.test(html.replace(/<style[\s\S]*?<\/style>/g, '')));
	check('no countdown chips, stock bar or viewers', !/sale ends|left in stock|viewing|people are|% sold/i.test(html));
	check('no ratings or reviews', !/★|Pet Parents|What owners are saying/.test(html));
	// The owner's rule since 2026-10-18: no "pet", "dog" or "cat" in what a
	// shopper reads, the header and footer included. Tags and attributes
	// (photo alt text, file names) aside; "ChillMyPet" has no word boundary
	// before "Pet", so it passes.
	const words = html
		.replace(/<script[\s\S]*?<\/script>/g, ' ')
		.replace(/<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]*>/g, ' ');
	check('the page says no pet, dog or cat', !/\b(pets?|dogs?|cats?|puppy|kitten)\b/i.test(words), /.{0,40}\b(pets?|dogs?|cats?|puppy|kitten)\b.{0,40}/i.exec(words)?.[0]);
	check('nor claims heat, modes or a battery', !/\b(heat|heated|warm(th|ing)?|modes?|battery|charg(e|ing)|USB)\b/i.test(words), /.{0,40}\b(heat|heated|warm(th|ing)?|modes?|battery|charg(e|ing)|USB)\b.{0,40}/i.exec(words)?.[0]);
	const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? html;
	check('no other product’s copy leaked in', !/santa|christmas tree|reindeer|life jacket|outfit|costume/i.test(main.replace(/<[^>]*>/g, ' ')));
	const checkout = await fetch(`${URL_}/checkout`);
	check('its one-page checkout answers, for an ad that should land on the form', checkout.status === 200, String(checkout.status));
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

// --- /catalog on a phone ----------------------------------------------------------
{
	await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
	await page.locator(`a.card[href="/products/${SLUG}"]`).click();
	await page.waitForURL(`**/products/${SLUG}`);
	check('a card leads to its product page', new URL(page.url()).pathname === `/products/${SLUG}`);
}

// Start clean, except for a size another product's page left behind: the
// massager must not read it as its own.
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
	sessionStorage.setItem('store-state', JSON.stringify({ size: 'M' }));
});
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

// --- the first screen ------------------------------------------------------------
{
	await page.evaluate(() => window.scrollTo(0, 0));
	check('the price is on the first screen', (await bottom('#variant-picker .price')) <= 664);
	check('both colours are on the first screen', (await bottom('#variant-picker input[name="design"] >> xpath=../..')) <= 664);
	check('the page opens on khaki, the listing photo', (await page.locator('#variant-picker input[name="design"]:checked').getAttribute('value')) === 'khaki' && (await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/khaki.jpg'));
	await page.setViewportSize({ width: 390, height: 844 });
}

// --- ViewContent ------------------------------------------------------------------
{
	const b = await browserEvent('ViewContent');
	check('ViewContent names the product', JSON.stringify(b[0]?.[2]?.content_ids) === `["${SLUG}"]`, JSON.stringify(b[0]?.[2]));
}

// --- pick a colour, buy one -------------------------------------------------------
await page.locator('#variant-picker label.tier', { hasText: 'Two massagers' }).click();
check('two massagers re-price the button', (await page.locator('#variant-picker button.cta').innerText()).includes('$107.86'), await page.locator('#variant-picker button.cta').innerText());
await page.locator('#variant-picker label.tier', { hasText: 'One massager' }).click();
await page.locator('#variant-picker label', { hasText: 'Black' }).click();
check('the gallery follows the colour', (await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/black.jpg'));
await page.locator('#variant-picker button', { hasText: /Add to cart/ }).click();
await page.waitForURL(`**/products/${SLUG}/checkout`, { timeout: 15000 });
{
	// Its own payment page, so its checkouts have their own address in GA4 and
	// in URL-based custom conversions, apart from `/checkout`.
	const url = new URL(page.url());
	check('add to cart opens the massager’s own payment page, not /checkout', url.pathname === `/products/${SLUG}/checkout`, page.url());
	check('at its plain address, with no choice in the link', url.search === '', url.search);
	check('the payment page has a title of its own', /^Checkout · Calming Massager/.test(await page.title()), await page.title());
	const line = await page.locator('.picker.folded').innerText().catch(() => 'not folded');
	check('the choice is one line, black, one size, with a way to change it', /Black[\s\S]*One size/.test(line) && !/Size:/.test(line) && /Change/.test(line), line);
	check('and it names the product first', /^\s*Calming Massager\s+Black · One size/.test(line), line);
}

{
	const lines = await cartLines();
	check(
		'one tap put exactly the black massager in the cart, one size, one of',
		lines.length === 1 && lines[0].colour === 'black' && lines[0].size === 'One size' && lines[0].quantity === 1,
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

await page.waitForSelector('button.shop-pay');
{
	const summary = (await page.locator('.shop-aside').textContent()) ?? '';
	check('checkout shows the massager, black, one size', summary.includes('Calming Massager') && /Black · One size/.test(summary), summary.slice(0, 300));
	check(`checkout charges $${PRICE}`, (await page.locator('button.shop-pay').innerText()).includes(`$${PRICE}`));
	check('and the payment page reports no second AddToCart', (await browserEvent('AddToCart')).length === 1);
}

await page.fill('#contact-email', 'calming-massager@example.com');
await page.fill('#shipping-firstName', 'Mary');
await page.fill('#shipping-lastName', 'Quiet');
await page.fill('#shipping-address', '1 Evergreen Terrace');
await page.fill('#shipping-city', 'Albany');
await page.selectOption('#shipping-state', 'NY');
await page.fill('#shipping-zip', '12207');
await page.locator('button.shop-pay').click();
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
		'the order line is the black massager at the server price',
		rows.rows.length === 1 &&
			row.sku === SKU &&
			row.option1 === 'black' &&
			row.option2 === 'One size' &&
			Number(row.unit_price_cents) === 5799 &&
			Number(row.quantity) === 1 &&
			row.product_slug === SLUG,
		JSON.stringify(row)
	);
	db.close();
}

// --- its payment page, opened straight, fills the cart with no size tap ------------
{
	await page.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	await page.goto(`${URL_}/checkout`, { waitUntil: 'networkidle' });
	check('the payment page shows no size buttons', (await page.locator('input[name="size"]').count()) === 0);
	// With one size the choice is already whole, so the picker opens folded on
	// the lead colour; Change opens it.
	await page.locator('.picker.folded button', { hasText: 'Change' }).click();
	await page.locator('#variant-picker label', { hasText: 'Black' }).click();
	await page.waitForFunction(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]').length === 1, null, { timeout: 5000 }).catch(() => {});
	const lines = await cartLines();
	check('choosing a colour there puts it in the cart', lines.length === 1 && lines[0].colour === 'black' && lines[0].size === 'One size', JSON.stringify(lines));
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
