/**
 * A product's one-page checkout, `/products/<slug>/checkout`: choose and pay on
 * the same page, on a phone-sized screen.
 *
 *   node tests/one-page-checkout.mjs
 *
 * What it pins down:
 *   - the first response: the product's strip, title and picker over the
 *     checkout's fields, one h1, no add-to-cart button, not indexed; and no
 *     such page for a product whose picker can't say which variant is wanted
 *   - choosing is adding: the cart is exactly what the picker shows, through
 *     colour, size and bundle changes, and the server prices it
 *   - tracking: ViewContent on arrival, ONE AddToCart however often the size
 *     changes, InitiateCheckout only once the buyer starts on their details
 *     and only once, each paired browser + /api/track under one event id
 *   - the order: the same action as /checkout, so the same row and the same
 *     order-derived Purchase id
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
// The reindeer hoodie keeps this look; the costume's checkout is the shop
// look's payment page (tests/christmas-tree-costume.mjs, shop-checkout.mjs).
const SLUG = 'christmas-hoodie';
const URL_ = `${BASE}/products/${SLUG}/checkout`;

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
	check('the product title is the h1', /<h1[^>]*>[\s\S]{0,200}?Christmas Hoodie/.test(html));
	check('and it is the only h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('SSR shows the photos', html.includes('class="gallery'));
	check('SSR offers its colour', html.includes('>Red<'));
	check('SSR offers the bundle cards at the server’s prices', html.includes('$52.06') && html.includes('$76.41'));
	check('no size is pre-selected', !/name="size"[^>]*checked/.test(html));
	const picker = /id="variant-picker"[\s\S]*?<\/fieldset>\s*(?:<!--[^>]*-->\s*)*(?:<\/div>|<p)/.exec(html)?.[0] ?? '';
	check('the picker has no button of its own', picker.length > 0 && !html.includes('class="cta'));
	check('the size guide link goes to the product page', html.includes(`href="/products/${SLUG}#size-guide"`));
	check('SSR asks for contact and address', html.includes('id="contact-email"') && /id="shipping-/.test(html));
	check('SSR has the pay section', /Payment/.test(html));
	check('the page is not indexed', /name="robots" content="noindex/.test(html));
	check('og:image is absolute', /property="og:image" content="https?:\/\//.test(html));
}
{
	// Every product has a size picker now (the life jacket since 2026-10-19),
	// so every product has one.
	const res = await fetch(`${BASE}/products/life-jacket/checkout`);
	check('the life jacket has a one-page checkout too', res.status === 200, String(res.status));
	const missing = await fetch(`${BASE}/products/no-such-thing/checkout`);
	check('an unknown slug has none', missing.status === 404, String(missing.status));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true
});
// fbq stays a stub, so every call accumulates in fbq.queue; GA4 hits go nowhere.
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
// The checkout's form, not the header's language switcher.
const checkoutForm = () => page.locator('main ~ form, form[method="POST"]:not([action])');
const summary = () => checkoutForm().innerText();

async function pairedOnce(name) {
	const b = await browserEvent(name);
	const s = serverCopy(name);
	const id = b[0]?.[3]?.eventID;
	check(`${name} fired once in the browser`, b.length === 1, `fired ${b.length}x`);
	check(`${name} was mirrored to /api/track once`, s.length === 1, `mirrored ${s.length}x`);
	check(`${name} browser and server share one event_id`, Boolean(id) && s[0]?.eventId === id, `${id} vs ${s[0]?.eventId}`);
	return b[0]?.[2] ?? {};
}

const settle = () => page.waitForLoadState('networkidle');
// The summary re-prices through /api/cart after every change, so read it once
// that answer has landed rather than racing it.
const shows = (pattern) =>
	checkoutForm()
		.filter({ hasText: pattern })
		.waitFor({ timeout: 5000 })
		.then(() => true)
		.catch(() => false);

await page.goto(URL_, { waitUntil: 'networkidle' });
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
});
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

// --- the first screen, as the Facebook app on an iPhone shows it --------------
{
	await page.setViewportSize({ width: 390, height: 664 });
	const bottom = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().bottom);
	check('the price is on the first screen', (await bottom('#variant-picker .price')) <= 664);
	const sizes = await bottom('#size-picker label');
	check('and so are the size buttons', sizes <= 664, `they end at ${sizes}px`);
	check('no product menu on a checkout', !(await page.locator('header nav > ul').isVisible()));
	check('no order box at the top: the product is the top', (await page.locator('section[aria-label="Your order"]').count()) === 0);
	await page.setViewportSize({ width: 390, height: 844 });
}

// --- arriving --------------------------------------------------------------------
{
	const view = await pairedOnce('ViewContent');
	check('ViewContent names the product', JSON.stringify(view.content_ids) === `["${SLUG}"]`, JSON.stringify(view));
	check('nothing is in the cart before a size is chosen', (await cartLines()).length === 0);
	check('the summary says to choose above', (await summary()).includes('Pick a colour and size above'));
	check('and the pay button waits', await checkoutForm().locator('button[type="submit"]').isDisabled());
	check('no AddToCart or InitiateCheckout yet', (await browserEvent('AddToCart')).length === 0 && (await browserEvent('InitiateCheckout')).length === 0);
}

// --- choosing is adding -------------------------------------------------------------
check('the colour it opens on adds nothing alone', (await cartLines()).length === 0);
await page.locator('#size-picker label').filter({ hasText: /^\s*S\s*$/ }).click();
await settle();
{
	const lines = await cartLines();
	check('a size puts the chosen variant in the cart', lines.length === 1 && lines[0].colour === 'red' && lines[0].size === 'S' && lines[0].quantity === 1, JSON.stringify(lines));
	check('the summary prices it', await shows(/Red · S[\s\S]*\$27\.99/), await summary());
}
await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
await page.locator('#variant-picker label.tier', { hasText: 'Two hoodies' }).click();
await settle();
{
	const lines = await cartLines();
	check('a new size replaces the line, it doesn’t add one', lines.length === 1 && lines[0].size === 'M', JSON.stringify(lines));
	check('the bundle sets the quantity', lines[0]?.quantity === 2, JSON.stringify(lines));
	check('and the server’s bundle price is the total', await shows(/Total\s*\$52\.06/), await summary());
	const add = await pairedOnce('AddToCart');
	check('the one AddToCart is the first choice', JSON.stringify(add.content_ids) === '["CMP-RH-RED-S"]', JSON.stringify(add));
	check('choosing does not start the checkout', (await browserEvent('InitiateCheckout')).length === 0);
}

// --- starting on the details ---------------------------------------------------------
await page.fill('#contact-fullName', 'Holly Ivy');
await settle();
await pairedOnce('InitiateCheckout');
await page.locator('#size-picker label').filter({ hasText: /^\s*L\s*$/ }).click();
await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
await settle();
check('changing the size after that is still one checkout', (await browserEvent('InitiateCheckout')).length === 1);
check('and still one add', (await browserEvent('AddToCart')).length === 1);

// --- place the order -----------------------------------------------------------------
await page.fill('#contact-email', 'tree@example.com');
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
check('and the page stayed this one', new URL(page.url()).pathname === `/products/${SLUG}/checkout`, page.url());
check('the confirmation sends them back to the product', await page.locator(`a[href="/products/${SLUG}"]`).count() > 0);

{
	const db = createClient({
		url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	});
	const rows = await db.execute({
		sql: `select oi.sku, oi.quantity, oi.unit_price_cents, o.total_cents
		      from order_items oi join orders o on o.id = oi.order_id
		      where o.order_number = ?`,
		args: [orderNumber ?? '']
	});
	const row = rows.rows[0];
	check(
		'the order is two red M hoodies at the bundle price',
		rows.rows.length === 1 &&
			row.sku === 'CMP-RH-RED-M' &&
			Number(row.quantity) === 2 &&
			Number(row.unit_price_cents) === 2799 &&
			Number(row.total_cents) === 5206,
		JSON.stringify(row)
	);
	db.close();
}

{
	const purchase = (await browserEvent('Purchase'))[0];
	check('Purchase carries the order-derived event id', purchase?.[3]?.eventID === `purchase-${orderNumber}`, JSON.stringify(purchase?.[3]));
	check('Purchase is never posted to /api/track', serverCopy('Purchase').length === 0);
	check('the cart is empty after the order', (await cartLines()).length === 0);
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
