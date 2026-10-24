/**
 * The massager's shop checkout, `/products/calming-massager/checkout`:
 * where the product page's Add to cart lands, laid out like a hosted shop
 * checkout and driven the way the Christmas ad's visitors arrive, on an
 * iPhone inside the Facebook app (390×664).
 *
 *   node tests/shop-checkout.mjs
 *
 * What it pins down:
 *   - the first response: the choice the link carries already chosen (folded
 *     picker), the shop chrome, the reference's sections in order, one h1,
 *     not indexed, no way off to buy.stripe.com; a link without a choice
 *     gets the whole picker; a `?vid=` in the link is never taken as the
 *     visitor id
 *   - the phone: the email on the first screen, nothing a buyer reads under
 *     16px, the summary as a bar that opens in place
 *   - tracking: NO ViewContent and NO AddToCart (the product page sent both,
 *     added=1) even when the size is changed here, InitiateCheckout once the
 *     email is typed, each browser event mirrored to /api/track under its id
 *   - errors: pay with nothing filled marks each field, says why under it,
 *     and takes focus to the first one; nothing is posted
 *   - the order: first and last name stored as typed ("Mary Ann" stays a
 *     first name), the variant and price the server set, Purchase under the
 *     order-derived id
 *   - a desktop: the summary beside the form, no bar
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 *
 * With PAYMENTS_BASE_URL pointing at a second dev server that has
 * STRIPE_PUBLISHABLE_KEY and a dummy STRIPE_SECRET_KEY (no order is placed),
 * it also loads the real Stripe.js and checks that the pay button does not
 * move while the Payment Element loads, that Link is not offered, and that a
 * blocked js.stripe.com leaves the hosted-page fallback in place of the card
 * fields. It needs network access to js.stripe.com.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SLUG = 'calming-massager';
const PATH = `/products/${SLUG}/checkout`;
// As the product page's Add to cart sends it.
// One size, and the product page's link names it like any other.
const FROM_PRODUCT = `${PATH}?design=black&size=One+size&added=1`;
// The Facebook app's in-app browser on an iPhone, as the ads open the page.
const FB_IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- the first response, before any JavaScript --------------------------------
{
	const res = await fetch(`${BASE}${FROM_PRODUCT}`);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	check('the shop chrome: the name, a padlock, no cart link', html.includes('class="shop-header"') && html.includes('Secure checkout') && !html.includes('href="/checkout"'));
	check('the choice from the link is chosen on the server: the picker is folded', /class="picker folded[\s"]/.test(html) && />\s*Black\s*</.test(html) && />\s*One size\s*</.test(html));
	check('no product photos or strip: this page is the checkout', !html.includes('class="gallery') && !html.includes('announcement'));
	const order = ['shop-contact-title', 'shop-delivery-title', 'shop-method-title', 'shop-payment-title'].map((id) => html.indexOf(`id="${id}"`));
	check('Contact, Delivery, Shipping method, Payment, in that order', order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), JSON.stringify(order));
	check('email, then country, first and last name, address, city, state, ZIP', ['contact-email', 'shipping-country', 'shipping-firstName', 'shipping-lastName', 'shipping-address', 'shipping-address2', 'shipping-city', 'shipping-state', 'shipping-zip'].every((id) => html.includes(`id="${id}"`)));
	check('every field is labelled', ['contact-email', 'shipping-firstName', 'shipping-zip'].every((id) => html.includes(`for="${id}"`)));
	check('the email note keeps the reminder promise', html.includes('we&#39;ll send one reminder') || html.includes("we'll send one reminder"));
	check('no pre-ticked marketing box', !/type="checkbox"[^>]*checked/.test(html) && !/news and offers/i.test(html));
	check('Standard shipping only, free (Express is off)', html.includes('Standard') && !html.includes('Express') && !html.includes('$12.00'));
	check('the policy links sit under the button', ['/policies/refunds', '/policies/shipping', '/privacy', '/terms', '/contact'].every((href) => html.includes(`href="${href}"`)));
	check('one h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('not indexed', /name="robots" content="noindex/.test(html));
	check('nothing leads to a Stripe Payment Link', !html.includes('buy.stripe.com'));
}
{
	const html = await (await fetch(`${BASE}${PATH}`)).text();
	// One size: with no choice in the link the lead colour and the only size
	// are already a choice, so the picker folds to it.
	check('without a choice in the link, the lead colour and its one size are chosen', /class="picker folded[\s"]/.test(html) && />\s*One size\s*</.test(html) && !html.includes('id="size-picker"'));
	const bogus = await (await fetch(`${BASE}${PATH}?design=black&size=XXXL`)).text();
	check('a size this product does not sell is ignored', !bogus.includes('XXXL') && />\s*One size\s*</.test(bogus));
}
{
	// The retired Christmas landing page handed its visitor id over in the
	// link. Nothing sends one now, and a link could carry someone else's.
	const vid = 'b'.repeat(64);
	const fresh = await fetch(`${BASE}${PATH}?vid=${vid}`);
	const cookie = fresh.headers.get('set-cookie') ?? '';
	check('a first visit gets a visitor id of its own, not the link’s', /cmp_vid=[a-f0-9]{64}/.test(cookie) && !cookie.includes(`cmp_vid=${vid}`), cookie);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

function watch(page) {
	const errors = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		const text = m.text();
		if (text.includes('ERR_FAILED') || text.includes('net::')) return;
		errors.push(`console: ${text}`);
	});
	return errors;
}

async function quiet(ctx) {
	// fbq stays a stub, so every call accumulates in fbq.queue; GA4 hits go nowhere.
	await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
	await ctx.route('**/facebook.com/tr*', (route) => route.abort());
	await ctx.route('**/google.com/g/collect*', (route) => route.abort());
	await ctx.route('**/google-analytics.com/**', (route) => route.abort());
}

const ctx = await browser.newContext({
	viewport: { width: 390, height: 664 },
	userAgent: FB_IPHONE,
	isMobile: true,
	hasTouch: true
});
await quiet(ctx);
const page = await ctx.newPage();
const pageErrors = watch(page);

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
const browserEvent = async (name) => (await fbqCalls()).filter((c) => c[0] === 'track' && c[1] === name);
const serverCopy = (name) => serverCopies.filter((b) => b.eventName === name);
const cartLines = () => page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
const settle = () => page.waitForLoadState('networkidle');

async function pairedOnce(name) {
	const b = await browserEvent(name);
	const s = serverCopy(name);
	const id = b[0]?.[3]?.eventID;
	check(`${name} fired once in the browser`, b.length === 1, `fired ${b.length}x`);
	check(`${name} was mirrored to /api/track once`, s.length === 1, `mirrored ${s.length}x`);
	check(`${name} browser and server share one event_id`, Boolean(id) && s[0]?.eventId === id, `${id} vs ${s[0]?.eventId}`);
	return b[0]?.[2] ?? {};
}

// A clean session, as a visitor from the ad has.
await page.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
});
serverCopies.length = 0;
await page.goto(`${BASE}${FROM_PRODUCT}&fbclid=ad1&utm_source=fb`, { waitUntil: 'networkidle' });
{
	// The link's own choice is read, then taken out of the address bar; an
	// ad's parameters stay.
	const url = new URL(page.url());
	check('the address bar drops the choice the link carried', !['design', 'size', 'bundle', 'added'].some((k) => url.searchParams.has(k)), url.search);
	check('and keeps the ad’s parameters', url.searchParams.get('fbclid') === 'ad1' && url.searchParams.get('utm_source') === 'fb', url.search);
	check('the choice is still made: black, one size', /Black[\s\S]*One size/.test(await page.locator('.picker.folded').innerText().catch(() => '')));
	await page.reload({ waitUntil: 'networkidle' });
	check('and a reload keeps it, from the session', /Black[\s\S]*One size/.test(await page.locator('.picker.folded').innerText().catch(() => '')));
	check('a reload still knows the product page reported the view', (await browserEvent('ViewContent')).length === 0 && serverCopy('ViewContent').length === 0);
}

// --- the first screen ------------------------------------------------------------
{
	const bottom = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().bottom);
	const email = await bottom('#contact-email');
	check('the email field is on the first screen', email <= 664, `it ends at ${email}px`);
	check('the total is in the bar at the top', /\$57\.99/.test(await page.locator('.shop-bar').innerText()));
	check('the summary is folded on a phone', (await page.locator('.shop-bar button').getAttribute('aria-expanded')) === 'false' && !(await page.locator('.shop-aside').isVisible()));

	// Text a buyer reads, anywhere outside Stripe's frame: 16px or more.
	const small = await page.evaluate(() => {
		const out = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const el = node.parentElement;
			if (!el || !node.textContent.trim() || el.closest('.sr-only, script, style, noscript')) continue;
			const rect = el.getBoundingClientRect();
			if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
			const size = parseFloat(getComputedStyle(el).fontSize);
			if (size < 16) out.push(`${size}px "${node.textContent.trim().slice(0, 30)}"`);
		}
		return out;
	});
	check('no visible text under 16px', small.length === 0, small.slice(0, 5).join('; '));
	const inputs = await page.$$eval('.shop input:not([type=radio]):not([type=hidden]), .shop select', (els) =>
		els.map((e) => [e.id, parseFloat(getComputedStyle(e).fontSize), e.getBoundingClientRect().height])
	);
	check('fields type at 16px or more (iOS does not zoom) and are easy to tap', inputs.length >= 9 && inputs.every(([, size, h]) => size >= 16 && h >= 44), JSON.stringify(inputs.filter(([, s, h]) => s < 16 || h < 44)));

	const target = await page.$$eval('.shop button, .shop a, .shop-choice', (els) =>
		els.filter((e) => e.getBoundingClientRect().height > 0).map((e) => [e.textContent.trim().slice(0, 20), Math.round(e.getBoundingClientRect().height)])
	);
	check('every button and link is 44px tall or more', target.every(([, h]) => h >= 44), JSON.stringify(target.filter(([, h]) => h < 44)));
}

// --- arriving from the product page ---------------------------------------------------
await settle();
{
	const lines = await cartLines();
	check('the chosen massager is in the cart', lines.length === 1 && lines[0].colour === 'black' && lines[0].size === 'One size' && lines[0].quantity === 1, JSON.stringify(lines));
	check('no ViewContent: the product page reported the view', (await browserEvent('ViewContent')).length === 0 && serverCopy('ViewContent').length === 0);
	check('no AddToCart: the product page reported it', (await browserEvent('AddToCart')).length === 0 && serverCopy('AddToCart').length === 0);
	check('no InitiateCheckout before any detail is typed', (await browserEvent('InitiateCheckout')).length === 0);
	check('the pay button names the total', /Pay \$57\.99/.test(await page.locator('button.shop-pay').innerText()));
}

// --- the summary bar opens in place ---------------------------------------------------
await page.locator('.shop-bar button').click();
{
	const folded = page.locator('#shop-summary-folded');
	check('the bar opens the summary', (await page.locator('.shop-bar button').getAttribute('aria-expanded')) === 'true' && (await folded.isVisible()));
	const text = await folded.innerText();
	check('it shows the item, its colour and size, and the totals', /Calming Massager/.test(text) && /Black · One size/.test(text) && /Shipping\s*Free/.test(text) && /Total\s*USD\s*\$57\.99/.test(text), text);
	await page.locator('.shop-bar button').click();
	check('and folds again', !(await folded.isVisible()));
}

// --- changing the colour here -------------------------------------------------------------
await page.locator('#variant-picker button', { hasText: 'Change' }).click();
await page.locator('#variant-picker label', { hasText: 'Khaki' }).click();
await settle();
{
	const lines = await cartLines();
	check('Change opens the picker and a new colour replaces the line', lines.length === 1 && lines[0].colour === 'khaki', JSON.stringify(lines));
	check('still no AddToCart from this page', (await browserEvent('AddToCart')).length === 0);
	check('the picker stays open while the buyer is in it', await page.locator('#variant-picker label', { hasText: 'Black' }).isVisible());
}

// --- pay with nothing filled ----------------------------------------------------------------
{
	let posted = false;
	const onPost = (req) => {
		if (req.method() === 'POST' && new URL(req.url()).pathname === PATH) posted = true;
	};
	page.on('request', onPost);
	await page.locator('button.shop-pay').click();
	await page.waitForTimeout(800);
	page.off('request', onPost);
	check('nothing is posted', !posted);
	const invalid = await page.$$eval('[aria-invalid="true"]', (els) => els.map((e) => e.id));
	check('each missing field is marked', ['contact-email', 'shipping-firstName', 'shipping-lastName', 'shipping-address', 'shipping-city', 'shipping-state', 'shipping-zip'].every((id) => invalid.includes(id)), JSON.stringify(invalid));
	check('and says why, under itself', (await page.locator('#contact-email-error').innerText()) === 'Please enter your email address' && (await page.locator('#shipping-zip-error').innerText()) === 'Please enter your ZIP code' && (await page.locator('#shipping-state-error').innerText()) === 'Please choose your State');
	check('the field reads as an error: red border', await page.locator('#contact-email').evaluate((e) => getComputedStyle(e).borderTopColor === 'rgb(176, 0, 32)'));
	check('the message is tied to its field for a screen reader', ((await page.locator('#contact-email').getAttribute('aria-describedby')) ?? '').includes('contact-email-error'));
	check('focus goes to the first one', (await page.evaluate(() => document.activeElement?.id)) === 'contact-email');
	check('and a line by the button says where to look', /marked in red above/.test(await page.locator('.shop-alert').innerText()));
	check('the optional apartment field is not marked', (await page.locator('#shipping-address2').getAttribute('aria-invalid')) === null);
}

// --- filling it in ------------------------------------------------------------------------------
await page.fill('#contact-email', 'not-an-email');
await page.locator('#contact-email').blur();
check('a malformed email says what it should look like', /name@example\.com/.test(await page.locator('#contact-email-error').innerText()));
await page.fill('#contact-email', 'holly@example.com');
await settle();
check('a good email clears its message', (await page.locator('#contact-email-error').count()) === 0);
await pairedOnce('InitiateCheckout');

await page.fill('#shipping-firstName', 'Mary Ann');
await page.fill('#shipping-lastName', 'Smith');
await page.fill('#shipping-address', '1 Evergreen Terrace');
await page.fill('#shipping-city', 'Albany');
await page.selectOption('#shipping-state', 'NY');
await page.fill('#shipping-zip', '12207');
check('every message has gone', (await page.locator('[aria-invalid="true"]').count()) === 0);
check('still one InitiateCheckout', (await browserEvent('InitiateCheckout')).length === 1);

check('one shipping choice, Standard, already chosen', (await page.locator('.shop-choice').count()) === 1 && (await page.locator('.shop-choice input').isChecked()));

await page.locator('button.shop-pay').click();
await page
	.getByRole('heading', { name: /order received/i })
	.waitFor({ timeout: 20000 })
	.catch(() => {});
const body = (await page.textContent('body')) ?? '';
const orderNumber = /CMP-[0-9A-F]{8}/.exec(body)?.[0];
check('the order was accepted', Boolean(orderNumber), body.slice(0, 300));
check('the page stayed this one', new URL(page.url()).pathname === PATH, page.url());

{
	const db = createClient({
		url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	});
	const rows = await db.execute({
		sql: `select o.first_name, o.last_name, o.province, o.postal_code, o.country, o.email,
		             o.total_cents, oi.sku, oi.quantity, oi.unit_price_cents
		      from orders o join order_items oi on oi.order_id = o.id
		      where o.order_number = ?`,
		args: [orderNumber ?? '']
	});
	const row = rows.rows[0] ?? {};
	check('the names are stored as typed: "Mary Ann" stays a first name', row.first_name === 'Mary Ann' && row.last_name === 'Smith', JSON.stringify(row));
	check('the address is stored with ISO codes', row.province === 'NY' && row.postal_code === '12207' && row.country === 'US', JSON.stringify(row));
	check('the order is one khaki massager at the server’s price, free shipping', rows.rows.length === 1 && row.sku === 'CMP-MS-KHAKI' && Number(row.quantity) === 1 && Number(row.unit_price_cents) === 5799 && Number(row.total_cents) === 5799, JSON.stringify(row));
	db.close();
}
{
	const purchase = (await browserEvent('Purchase'))[0];
	check('Purchase carries the order-derived event id', purchase?.[3]?.eventID === `purchase-${orderNumber}`, JSON.stringify(purchase?.[3]));
	check('Purchase is never posted to /api/track', serverCopy('Purchase').length === 0);
	check('still no AddToCart from this page, start to finish', (await browserEvent('AddToCart')).length === 0);
}
await ctx.close();

// --- an address outside the US ------------------------------------------------------------------
// A real one the owner tried on 2026-10-17: Czechia has no states, so the
// state field must be optional there, and the order must take the address
// as typed.
{
	const cz = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
	await quiet(cz);
	const p = await cz.newPage();
	pageErrors.push(...watch(p));
	await p.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });
	await p.evaluate(() => {
		localStorage.clear();
		sessionStorage.clear();
	});
	await p.goto(`${BASE}${FROM_PRODUCT}`, { waitUntil: 'networkidle' });
	await p.selectOption('#shipping-country', { label: 'Czechia' });
	check('Czechia: no state list, and the field says it is optional', (await p.locator('select#shipping-state').count()) === 0 && /optional/i.test(await p.locator('label[for="shipping-state"]').innerText()));
	check('and the postcode is called a postal code', /Postal code/.test(await p.locator('label[for="shipping-zip"]').innerText()));
	await p.fill('#contact-email', 'teplice@example.com');
	await p.fill('#shipping-firstName', 'Jana');
	await p.fill('#shipping-lastName', 'Nováková');
	await p.fill('#shipping-address', 'Skupova 1255');
	await p.fill('#shipping-city', 'Teplice');
	await p.fill('#shipping-zip', '41501');
	await p.waitForLoadState('networkidle');
	await p.locator('button.shop-pay').click();
	await p.getByRole('heading', { name: /order received/i }).waitFor({ timeout: 20000 }).catch(() => {});
	const number = /CMP-[0-9A-F]{8}/.exec((await p.textContent('body')) ?? '')?.[0];
	check('a Czech address with no state places the order', Boolean(number));
	const db = createClient({ url: process.env.TURSO_DATABASE_URL ?? 'file:local.db', authToken: process.env.TURSO_AUTH_TOKEN });
	const row = (await db.execute({ sql: 'select country, postal_code, city, address1, province, last_name, shipping_cents from orders where order_number = ?', args: [number ?? ''] })).rows[0] ?? {};
	check('stored as typed, as CZ, with free Standard shipping', row.country === 'CZ' && row.postal_code === '41501' && row.city === 'Teplice' && row.address1 === 'Skupova 1255' && row.last_name === 'Nováková' && Number(row.shipping_cents) === 0, JSON.stringify(row));
	db.close();
	await cz.close();
}

// --- a desktop ---------------------------------------------------------------------------------
{
	const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await quiet(desk);
	const p = await desk.newPage();
	pageErrors.push(...watch(p));
	await p.goto(`${BASE}${PATH}?design=khaki&size=One+size&added=1`, { waitUntil: 'networkidle' });
	const main = await p.locator('.shop-main').boundingBox();
	const aside = await p.locator('.shop-aside').boundingBox();
	check('the summary sits beside the form', Boolean(main && aside) && aside.x >= main.x + main.width - 1 && aside.y < main.y + 50, JSON.stringify({ main, aside }));
	check('no summary bar or second total on a desktop', !(await p.locator('.shop-bar').isVisible()) && !(await p.locator('.shop-due').isVisible()));
	check('the summary names the choice', /Khaki · One size/.test(await p.locator('.shop-aside').innerText()));
	const row = await p.locator('#shipping-firstName').boundingBox();
	const last = await p.locator('#shipping-lastName').boundingBox();
	check('first and last name share a row', Boolean(row && last) && Math.abs(row.y - last.y) < 2 && last.x > row.x);
	await desk.close();
}

// --- the Payment Element (only with PAYMENTS_BASE_URL) ----------------------------------------------
if (process.env.PAYMENTS_BASE_URL) {
	const PAY = process.env.PAYMENTS_BASE_URL;
	for (const [label, viewport] of [
		['phone', { width: 390, height: 664 }],
		['desktop', { width: 1280, height: 900 }]
	]) {
		const c = await browser.newContext({ viewport, isMobile: label === 'phone', hasTouch: label === 'phone' });
		await quiet(c);
		const p = await c.newPage();
		await p.goto(`${PAY}${PATH}?design=black&size=One+size&added=1`);
		const tops = new Set();
		const deadline = Date.now() + 15000;
		let ready = false;
		while (Date.now() < deadline) {
			const state = await p.evaluate(() => {
				const btn = document.querySelector('button.shop-pay');
				const frame = document.querySelector('.shop-pay-box iframe');
				return { top: btn ? Math.round(btn.getBoundingClientRect().top + scrollY) : null, frame: frame ? frame.getBoundingClientRect().height : 0 };
			});
			if (state.top !== null) tops.add(state.top);
			if (state.frame > 100) {
				ready = true;
				await p.waitForTimeout(1500);
				tops.add(await p.evaluate(() => Math.round(document.querySelector('button.shop-pay').getBoundingClientRect().top + scrollY)));
				break;
			}
			await p.waitForTimeout(100);
		}
		check(`${label}: the Payment Element loads`, ready);
		check(`${label}: the pay button does not move while it loads`, tops.size === 1, [...tops].join(' → '));
		// What the buyer can read inside Stripe's frame: the methods and card
		// brands it offers. Link is hidden in code (wallets: { link: 'never' });
		// Google Pay is off in the account's configuration; Discover is not
		// offered to an account in Czechia.
		let offered = '';
		for (const f of p.frames()) {
			if (!f.url().includes('js.stripe.com/v3/elements-inner')) continue;
			offered += await f.evaluate(() => document.body.innerText).catch(() => '');
		}
		check(`${label}: the form offers cards`, /Card number/.test(offered), offered.slice(0, 120));
		check(`${label}: and no Link, Google Pay or Discover`, !/\bLink\b|Google Pay|Discover/.test(offered), offered.slice(0, 300));
		await c.close();
	}

	const blocked = await browser.newContext({ viewport: { width: 390, height: 664 } });
	await quiet(blocked);
	await blocked.route('**/js.stripe.com/**', (route) => route.abort());
	const p = await blocked.newPage();
	await p.goto(`${PAY}${PATH}?design=black&size=One+size&added=1`);
	const note = await p
		.locator('.shop-notice', { hasText: /Stripe/ })
		.waitFor({ timeout: 15000 })
		.then(() => true)
		.catch(() => false);
	check('Stripe.js blocked: the hosted page is offered instead of dead card fields', note);
	check('and the form tells the server the card fields are not there', (await p.locator('input[name="cardReady"]').inputValue()) === '0');
	await blocked.close();

	// Pay's order of work, with a stand-in Stripe.js that logs its calls.
	// Stripe's submit has to come first, while it is still the buyer's tap:
	// with Apple Pay chosen it opens the payment sheet, and Safari refuses that
	// after the server's round trip. A failed submit (an incomplete card, a
	// closed sheet) posts no order at all.
	const STUB = `window.Stripe = () => ({
		elements: () => ({
			create: () => ({ mount(el) { el.textContent = 'stub card'; }, on(e, cb) { (window.__on ??= {})[e] = cb; if (e === 'ready') setTimeout(cb, 0); }, unmount() {} }),
			submit: async () => { window.__calls.push('submit'); return window.__submitError ? { error: { message: window.__submitError } } : {}; },
			update() {},
			getElement() { return null; }
		}),
		confirmPayment: async () => { window.__calls.push('confirm'); return {}; }
	});`;
	const stubbed = await browser.newContext({ viewport: { width: 390, height: 664 } });
	await quiet(stubbed);
	await stubbed.route('**/js.stripe.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: STUB }));
	await stubbed.addInitScript(() => {
		window.__calls = [];
		const fetch0 = window.fetch;
		window.fetch = (input, init) => {
			if ((init?.method ?? 'GET').toUpperCase() === 'POST' && String(input).includes('/checkout')) window.__calls.push('post');
			return fetch0(input, init);
		};
	});
	const s = await stubbed.newPage();
	await s.goto(`${PAY}${PATH}?design=black&size=One+size&added=1`, { waitUntil: 'networkidle' });
	await s.locator('.shop-pay-box.ready').waitFor({ timeout: 15000 });
	// The Apple Pay tab is one line; the box gives up the card form's height
	// for it, and takes it back for Card.
	const reserve = () => s.locator('.shop-pay-box > div').evaluate((e) => getComputedStyle(e).minHeight);
	await s.evaluate(() => window.__on.change({ value: { type: 'apple_pay' } }));
	check('the Apple Pay tab leaves no empty box under it', (await reserve()) === '0px', await reserve());
	await s.evaluate(() => window.__on.change({ value: { type: 'card' } }));
	check('and Card has its height back', (await reserve()) === '316px', await reserve());
	await s.fill('#contact-email', 'sheet@example.com');
	await s.fill('#shipping-firstName', 'Holly');
	await s.fill('#shipping-lastName', 'Ivy');
	await s.fill('#shipping-address', '1 Evergreen Terrace');
	await s.fill('#shipping-city', 'Albany');
	await s.selectOption('#shipping-state', 'NY');
	await s.fill('#shipping-zip', '12207');
	await s.evaluate(() => (window.__submitError = 'Your card number is incomplete.'));
	await s.locator('button.shop-pay').click();
	await s.waitForTimeout(800);
	check('Pay: a failed Stripe submit posts no order', JSON.stringify(await s.evaluate(() => window.__calls)) === '["submit"]', JSON.stringify(await s.evaluate(() => window.__calls)));
	check('and says why', /card number is incomplete/.test(await s.locator('.shop-form').innerText()));
	check('and the button is free again', await s.locator('button.shop-pay').isEnabled());
	await s.evaluate(() => {
		window.__submitError = '';
		window.__calls = [];
	});
	await s.locator('button.shop-pay').click();
	await s.waitForFunction(() => window.__calls.includes('post'), null, { timeout: 15000 }).catch(() => {});
	const calls = await s.evaluate(() => window.__calls);
	check('Pay: Stripe’s submit comes before the order is posted (Apple Pay opens from the tap)', calls[0] === 'submit' && calls[1] === 'post', JSON.stringify(calls));
	await stubbed.close();
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
