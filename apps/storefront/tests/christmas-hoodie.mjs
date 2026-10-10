/**
 * The Christmas Pouch Hoodie, product page to placed order, on a phone-sized
 * screen (most of this page's traffic is Instagram and Facebook Reels).
 *
 *   node tests/christmas-hoodie.mjs
 *
 * What it pins down, because none of it is visible to a type check:
 *   - the first response: delivery strip, the wearer's-size note, none of the
 *     things this page must never carry (countdowns, was-prices, ratings)
 *   - no size, no sale: buying without a size prompts and adds nothing
 *   - the chosen design AND size become the cart line, the checkout line, the
 *     order row and every tracking payload, at $54.99 re-priced by the server
 *   - tracking: ViewContent, AddToCart and InitiateCheckout each reach Meta
 *     twice (browser + /api/track) under ONE event id; Purchase carries the
 *     id derived from the order number; GA4 items name the variant
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const URL_ = `${BASE}/products/christmas-pouch-hoodie`;
const PRICE = '54.99';
const SKU = 'CMP-XH-STOCKING-GREEN-L';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- the first response, before any JavaScript --------------------------------
{
	const res = await fetch(URL_);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	check('SSR carries the Christmas delivery strip', /Order by \w+day, Dec \d+ for Christmas delivery to the US/.test(html));
	check('SSR says the size is the wearer’s', /This is your size, not your pet’s/.test(html));
	check('SSR quotes the price', html.includes(`$${PRICE}`));
	check('SSR offers both designs', html.includes('Santa Red') && html.includes('Stocking Green'));
	check('SSR has a size guide section', html.includes('id="size-guide"'));
	check('no size is pre-selected', !/name="size"[^>]*checked/.test(html));
	check('no was-price or strikethrough price', !/compare|<s>|<del>/i.test(html.replace(/<style[\s\S]*?<\/style>/g, '')));
	check('no countdown, stock counter or viewers', !/sale ends|left in stock|viewing|people are/i.test(html));
	check('no ratings or reviews', !/★|Pet Parents|What owners are saying/.test(html));
	check('og:image is absolute', /property="og:image" content="https?:\/\//.test(html));
	check('the Meta pixel is the dataset 1341978141149107', html.includes("fbq('init', '1341978141149107'"));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true
});
// Block the real pixel lib: fbq stays a stub, so every call accumulates in
// fbq.queue where it can be read back without touching Meta.
await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
await ctx.route('**/facebook.com/tr*', (route) => route.abort());

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
	if (m.type() !== 'error') return;
	const text = m.text();
	if (text.includes('ERR_FAILED') || text.includes('net::')) return;
	pageErrors.push(`console: ${text}`);
});

// The server halves: every /api/track body the browser posts.
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
const dataLayer = () => page.evaluate(() => (window.dataLayer ?? []).filter((e) => e && e.event));

/** Browser event and server copy exist and share one event id. */
async function pairedOnce(name) {
	const b = await browserEvent(name);
	const s = serverCopy(name);
	const id = b[0]?.[3]?.eventID;
	check(`${name} fired once in the browser`, b.length === 1, `fired ${b.length}x`);
	check(`${name} was mirrored to /api/track once`, s.length === 1, `mirrored ${s.length}x`);
	check(`${name} browser and server share one event_id`, Boolean(id) && s[0]?.eventId === id, `${id} vs ${s[0]?.eventId}`);
	return { data: b[0]?.[2] ?? {}, server: s[0]?.customData ?? {} };
}

// Start clean: no cart, no leftover picker state from another page.
await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
});
// Only this load's events count: the first one was just to reach storage.
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

// --- ViewContent ----------------------------------------------------------------
{
	const view = await pairedOnce('ViewContent');
	check('ViewContent names the product', JSON.stringify(view.data.content_ids) === '["christmas-pouch-hoodie"]', JSON.stringify(view.data));
	check('ViewContent is worth the price', view.data.value === PRICE && view.data.currency === 'USD', JSON.stringify(view.data));
	check('ViewContent server copy carries the same data', view.server.value === PRICE, JSON.stringify(view.server));
	const item = (await dataLayer()).find((e) => e.event === 'view_item')?.ecommerce?.items?.[0];
	check('view_item reached the dataLayer', item?.item_id === 'christmas-pouch-hoodie', JSON.stringify(item));
}

// --- no size, no sale -------------------------------------------------------------
// Tried from the sticky bar, which knows nothing of sizes: the page has to send
// the shopper back to the picker rather than guess.
{
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	const dock = page.locator('button', { hasText: /^\s*Add to cart\s*$/ }).last();
	await dock.waitFor({ state: 'visible' });
	await dock.click();
	await page.locator('#size-error').filter({ hasText: /Pick your size first/ }).waitFor({ timeout: 5000 });
	check('buying without a size stays on the page', page.url().startsWith(URL_));
	check('and asks for the size', /Pick your size first/.test(await page.locator('#size-error').innerText()));
	await page.waitForTimeout(800);
	const inView = await page.locator('#size-picker').evaluate((el) => {
		const r = el.getBoundingClientRect();
		return r.top >= 0 && r.bottom <= window.innerHeight;
	});
	check('and scrolls the size picker into view', inView);
	check('nothing was added to the cart', (await cartLines()).length === 0);
	check('and no AddToCart was reported', (await browserEvent('AddToCart')).length === 0 && serverCopy('AddToCart').length === 0);
}

// --- pick design and size --------------------------------------------------------
await page.locator('#variant-picker label', { hasText: 'Stocking Green' }).click();
check(
	'the gallery follows the design',
	(await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/green_stocking.jpg')
);
await page.locator('#size-picker label').filter({ hasText: /^\s*L\s*$/ }).click();
check('the error clears once a size is chosen', (await page.locator('#size-error').innerText()).trim() === '');

await page.locator('#variant-picker button', { hasText: /Add to cart/ }).click();
await page.waitForURL('**/checkout', { timeout: 15000 });
check('add to cart lands on the checkout', new URL(page.url()).pathname === '/checkout');

{
	const lines = await cartLines();
	check(
		'the cart holds exactly the chosen design and size',
		lines.length === 1 && lines[0].colour === 'green_stocking' && lines[0].size === 'L' && lines[0].quantity === 1,
		JSON.stringify(lines)
	);
}

// --- AddToCart --------------------------------------------------------------------
{
	const add = await pairedOnce('AddToCart');
	check('AddToCart names the variant by SKU', JSON.stringify(add.data.content_ids) === `["${SKU}"]`, JSON.stringify(add.data));
	check('AddToCart is worth one hoodie', add.data.value === PRICE && add.data.num_items === 1, JSON.stringify(add.data));
	check('AddToCart contents carry quantity and price', add.data.contents?.[0]?.id === SKU && add.data.contents[0].item_price === 54.99, JSON.stringify(add.data.contents));
	check('AddToCart server copy matches', JSON.stringify(add.server.content_ids) === `["${SKU}"]` && add.server.value === PRICE, JSON.stringify(add.server));
	const item = (await dataLayer()).find((e) => e.event === 'add_to_cart')?.ecommerce?.items?.[0];
	check('add_to_cart names the variant for GA4', item?.item_id === SKU && item?.item_variant === 'green_stocking / L' && item?.price === 54.99, JSON.stringify(item));
}

// --- the checkout line, priced by the server ---------------------------------------
await page.waitForSelector('form dl');
{
	const summary = await page.locator('form', { has: page.locator('dl') }).innerText();
	check('checkout shows the product', summary.includes('Christmas Pouch Hoodie'), summary.slice(0, 300));
	check('checkout shows design and size', /Stocking Green · L/.test(summary), summary.slice(0, 300));
	check('checkout charges $54.99', (await page.locator('form dl').innerText()).includes(`$${PRICE}`));
}

// --- InitiateCheckout -----------------------------------------------------------------
{
	await page.waitForFunction(() => (window.fbq?.queue ?? []).some((c) => c[1] === 'InitiateCheckout'));
	// keepalive beacons can trail the browser event by a tick
	await page.waitForTimeout(300);
	const start = await pairedOnce('InitiateCheckout');
	check('InitiateCheckout names the SKU', JSON.stringify(start.data.content_ids) === `["${SKU}"]`, JSON.stringify(start.data));
	check('InitiateCheckout is worth the cart', start.data.value === PRICE, JSON.stringify(start.data));
	const item = (await dataLayer()).find((e) => e.event === 'begin_checkout')?.ecommerce?.items?.[0];
	check('begin_checkout names the variant for GA4', item?.item_variant === 'green_stocking / L', JSON.stringify(item));
}

// --- a tampered cart price is not what gets charged ------------------------------
{
	await page.evaluate(() => {
		const lines = JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]');
		for (const l of lines) l.unitPriceCents = 1;
		localStorage.setItem('chillmypet.cart.v1', JSON.stringify(lines));
	});
	await page.reload({ waitUntil: 'networkidle' });
	await page.waitForSelector('form dl');
	const dl = await page.locator('form dl').innerText();
	check('the server re-prices a tampered cart', dl.includes(`$${PRICE}`) && !dl.includes('$0.01'), dl);
}

// --- place the order --------------------------------------------------------------------
await page.fill('#contact-fullName', 'Holly Ivy');
await page.fill('#contact-email', 'christmas@example.com');
await page.fill('#shipping-lookup', '751');
await page.waitForSelector('[role="option"]');
await page.locator('[role="option"]').first().click();
await page.waitForSelector('#shipping-city');
await page.getByRole('button', { name: /^(Pay |Place order)/ }).click();
await page
	.getByRole('heading', { name: /order received/i })
	.waitFor({ timeout: 20000 })
	.catch(() => {});
const body = (await page.textContent('body')) ?? '';
const orderNumber = /CMP-[0-9A-F]{8}/.exec(body)?.[0];
check('the order was accepted', Boolean(orderNumber), body.slice(0, 300));

// --- the order row carries the design --------------------------------------------------
{
	const db = createClient({
		url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	});
	const rows = await db.execute({
		sql: `select oi.sku, oi.option1, oi.option2, oi.unit_price_cents, oi.quantity, oi.product_slug, o.store_id
		      from order_items oi join orders o on o.id = oi.order_id
		      where o.order_number = ?`,
		args: [orderNumber ?? '']
	});
	const row = rows.rows[0];
	check(
		'the order line is the chosen design and size at the server price',
		rows.rows.length === 1 &&
			row.sku === SKU &&
			row.option1 === 'green_stocking' &&
			row.option2 === 'L' &&
			Number(row.unit_price_cents) === 5499 &&
			Number(row.quantity) === 1 &&
			row.product_slug === 'christmas-pouch-hoodie' &&
			row.store_id === 'chillmypet',
		JSON.stringify(row)
	);
	db.close();
}

// --- Purchase -----------------------------------------------------------------------------
{
	const purchase = (await browserEvent('Purchase'))[0];
	check('Purchase fired', Boolean(purchase));
	check('Purchase names the SKU', JSON.stringify(purchase?.[2]?.content_ids) === `["${SKU}"]`, JSON.stringify(purchase?.[2]));
	check('Purchase is worth what was charged', purchase?.[2]?.value === PRICE, JSON.stringify(purchase?.[2]));
	check('Purchase carries the order-derived event id', purchase?.[3]?.eventID === `purchase-${orderNumber}`, JSON.stringify(purchase?.[3]));
	check('Purchase is never posted to /api/track', serverCopy('Purchase').length === 0);
	const buy = (await dataLayer()).find((e) => e.event === 'purchase');
	check('purchase reached the dataLayer with the order number', buy?.ecommerce?.transaction_id === orderNumber, JSON.stringify(buy?.ecommerce));
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
