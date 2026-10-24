/**
 * The classic checkout, `/products/christmas-tree-costume/checkout`: the
 * owner's Classic Christmas design (docs/classic-checkout.md), where the
 * costume's product page sends its Buy. Driven on an iPhone inside the
 * Facebook app (390×664), then on a desktop.
 *
 *   node tests/classic-checkout.mjs
 *
 * What it pins down:
 *   - the first response: no site chrome, the card's own header, the order
 *     panel with its colour, size and quantity selects (a choice in the link
 *     already chosen on the server), steps 1–4 in order, arrival dates from
 *     the shipping promise, one h1, not indexed, the reminder note kept, no
 *     pre-ticked box, nothing leading to buy.stripe.com
 *   - the phone: the price and the selects on the first screen, nothing wider
 *     than the screen, no text under 13px, inputs at 16px or more so iOS does
 *     not zoom, and the truck driving along the stripe (standing still under
 *     reduced motion)
 *   - choosing is adding: the cart is what the selects show, quantity is the
 *     server's bundle break; the hand-off link from the product page
 *   - tracking: ViewContent paired, ONE AddToCart however often the choice
 *     changes, InitiateCheckout once the email is typed and only once
 *   - errors: pay with fields missing posts nothing, marks each one under it
 *     and takes focus to the first
 *   - the order: names as typed, the bundle price, the method, Purchase under
 *     the order-derived id
 *   - a desktop: the order panel beside the form, its total on the first screen
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 * With PAYMENTS_BASE_URL it also loads the real Stripe.js into the card box,
 * as tests/shop-checkout.mjs does (it needs network access to js.stripe.com).
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const SLUG = 'christmas-tree-costume';
const PATH = `/products/${SLUG}/checkout`;
const FB_IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- the first response, before any JavaScript --------------------------------
{
	const res = await fetch(`${BASE}${PATH}`);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	check('no site header, cart link or footer around it', !html.includes('href="/checkout"') && !html.includes('All rights reserved'));
	check('the card’s own header: the logo and a padlock', html.includes('class="classic-head') && html.includes('Secure checkout'));
	check('the free-shipping stripe and its truck', html.includes('FREE shipping!') && html.includes('class="truck'));
	check('the order panel’s selects', ['order-design', 'order-size', 'order-qty'].every((id) => html.includes(`id="${id}"`)));
	check('both colours and every size', html.includes('>Green<') && html.includes('>Red<') && ['S', 'M', 'L'].every((s) => html.includes(`value="${s}"`)));
	check('quantities are the bundle breaks', /id="order-qty"[\s\S]*?value="1"[\s\S]*?value="2"[\s\S]*?value="3"/.test(html));
	check('the size bands from the catalogue', html.includes('M · 2.5–5 kg (6–11 lb)'));
	const steps = ['shop-contact-title', 'shop-delivery-title', 'shop-method-title', 'classic-payment-title'].map((id) => html.indexOf(`id="${id}"`));
	check('Contact, Delivery, Shipping, Payment, in that order', steps.every((i, n) => i > 0 && (n === 0 || i > steps[n - 1])), JSON.stringify(steps));
	// Svelte adds a scoped class to elements in a component with styles.
	check('numbered 1 to 4', [1, 2, 3, 4].every((n) => new RegExp(`class="step-no[^"]*" aria-hidden="true">${n}<`).test(html)));
	check('every field is labelled', ['contact-email', 'shipping-firstName', 'shipping-lastName', 'shipping-address', 'shipping-city', 'shipping-state', 'shipping-zip'].every((id) => html.includes(`for="${id}"`)));
	check('the apartment waits behind a link', html.includes('Add apartment or suite') && !html.includes('id="shipping-address2"'));
	check('standard delivery with its arrival dates, and no Express', html.includes('Standard delivery') && />Estimated arrival: [A-Z][a-z]{2} \d[^<]*<\/small>/.test(html) && !html.includes('Express'));
	check('the email note keeps the reminder promise', html.includes('we&#39;ll send one reminder') || html.includes("we'll send one reminder"));
	check('no pre-ticked box', !/type="checkbox"[^>]*checked/.test(html));
	check('the policy links sit under the button', ['/policies/refunds', '/policies/shipping', '/privacy', '/terms', '/contact'].every((href) => html.includes(`href="${href}"`)));
	check('one h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('not indexed', /name="robots" content="noindex/.test(html));
	check('nothing leads to a Stripe Payment Link', !html.includes('buy.stripe.com'));
}
{
	const html = await (await fetch(`${BASE}${PATH}?design=green&size=M`)).text();
	const selected = (id) => new RegExp(`id="${id}"[\\s\\S]*?</select>`).exec(html)?.[0] ?? '';
	check('a choice in the link is chosen on the server', /value="green"[^>]*selected/.test(selected('order-design')) && /value="M"[^>]*selected/.test(selected('order-size')));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function quiet(ctx) {
	await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
	await ctx.route('**/facebook.com/tr*', (route) => route.abort());
	await ctx.route('**/google.com/g/collect*', (route) => route.abort());
	await ctx.route('**/google-analytics.com/**', (route) => route.abort());
}

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

// --- the truck drives ------------------------------------------------------------
{
	const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true });
	await quiet(ctx);
	const page = await ctx.newPage();
	await page.goto(`${BASE}${PATH}`);
	// Rewound to its start and played to its end, wherever loading left it.
	const [start, end] = await page.locator('.classic-road .truck').evaluate((e) => {
		const drive = e.getAnimations().find((a) => a.animationName === 'classic-drive');
		if (!drive) return [0, 0];
		drive.pause();
		drive.currentTime = 0;
		const a = e.getBoundingClientRect().left;
		drive.finish();
		return [a, e.getBoundingClientRect().left];
	});
	check('the truck drives along the stripe', end - start > 200, `${start} → ${end}`);
	const shift = await page.locator('.classic-road .stripe').evaluate(async (e) => {
		const a = getComputedStyle(e).backgroundPositionX;
		await new Promise((r) => setTimeout(r, 300));
		return [a, getComputedStyle(e).backgroundPositionX];
	});
	check('and the stripe keeps moving under it', shift[0] !== shift[1], JSON.stringify(shift));
	await ctx.close();

	const still = await browser.newContext({ viewport: { width: 390, height: 664 }, reducedMotion: 'reduce' });
	await quiet(still);
	const p2 = await still.newPage();
	await p2.goto(`${BASE}${PATH}`);
	const [x, road] = await p2.evaluate(() => [
		document.querySelector('.classic-road .truck').getBoundingClientRect().right,
		document.querySelector('.classic-road').getBoundingClientRect().right
	]);
	check('under reduced motion it is already at the end', Math.abs(x - road) < 1, `${x} vs ${road}`);
	await still.close();
}

// --- the phone ---------------------------------------------------------------------
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
const posts = [];
page.on('request', (req) => {
	const path = new URL(req.url()).pathname;
	if (req.method() !== 'POST') return;
	if (path === '/api/track') {
		try {
			serverCopies.push(req.postDataJSON());
		} catch {
			/* not JSON — the endpoint would drop it too */
		}
	}
	if (path === PATH) posts.push(path);
});
const fbqCalls = () => page.evaluate(() => (window.fbq?.queue ?? []).map((a) => Array.from(a)));
const browserEvent = async (name) => (await fbqCalls()).filter((c) => c[0] === 'track' && c[1] === name);
const serverCopy = (name) => serverCopies.filter((b) => b.eventName === name);
const cartLines = () => page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
const settle = () => page.waitForLoadState('networkidle');
const totals = () => page.locator('.classic-totals').innerText();
const shows = (pattern) =>
	page
		.locator('.classic-totals')
		.filter({ hasText: pattern })
		.waitFor({ timeout: 5000 })
		.then(() => true)
		.catch(() => false);

async function pairedOnce(name) {
	const b = await browserEvent(name);
	const s = serverCopy(name);
	const id = b[0]?.[3]?.eventID;
	check(`${name} fired once in the browser`, b.length === 1, `fired ${b.length}x`);
	check(`${name} was mirrored to /api/track once`, s.length === 1, `mirrored ${s.length}x`);
	check(`${name} browser and server share one event_id`, Boolean(id) && s[0]?.eventId === id, `${id} vs ${s[0]?.eventId}`);
	return b[0]?.[2] ?? {};
}

await page.goto(`${BASE}${PATH}`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
	localStorage.clear();
	sessionStorage.clear();
});
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

{
	const bottom = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().bottom);
	check('the selects are on the first screen', (await bottom('#order-qty')) <= 664, `${await bottom('#order-qty')}px`);
	check('nothing is wider than the screen', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	const small = await page.evaluate(() => {
		const out = [];
		const walker = document.createTreeWalker(document.querySelector('.classic'), NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const node = walker.currentNode;
			if (!node.textContent.trim()) continue;
			const el = node.parentElement;
			if (!el.checkVisibility?.() || el.closest('.sr-only, option')) continue;
			const size = parseFloat(getComputedStyle(el).fontSize);
			if (size < 13) out.push(`${node.textContent.trim().slice(0, 30)} (${size}px)`);
		}
		return out;
	});
	check('no text under 13px', small.length === 0, small.join(', '));
	const inputs = await page.evaluate(() =>
		[...document.querySelectorAll('.classic input:not([type=radio]):not([type=hidden]), .classic select')]
			.map((e) => [e.id, parseFloat(getComputedStyle(e).fontSize)])
			.filter(([, size]) => size < 16)
	);
	check('every input and select is 16px or more (no iOS zoom)', inputs.length === 0, JSON.stringify(inputs));
	const targets = await page.evaluate(() =>
		[...document.querySelectorAll('.classic a, .classic button, .classic select, .classic summary')]
			.filter((e) => e.checkVisibility?.())
			.map((e) => [e.textContent.trim().slice(0, 20) || e.id, Math.round(e.getBoundingClientRect().height)])
			.filter(([, h]) => h < 44)
	);
	check('every link, button and select is at least 44px tall', targets.length === 0, JSON.stringify(targets));
}

// --- arriving ----------------------------------------------------------------------
{
	const view = await pairedOnce('ViewContent');
	check('ViewContent names the product', JSON.stringify(view.content_ids) === `["${SLUG}"]`, JSON.stringify(view));
	check('nothing is in the cart before a size is chosen', (await cartLines()).length === 0);
	check('the panel asks for a size', (await page.locator('.classic-size-note').innerText()).includes('Choose a size'));
	check('and the pay button waits', await page.locator('.classic-payb').isDisabled());
}

// --- choosing is adding --------------------------------------------------------------
await page.selectOption('#order-design', 'green');
check('a colour alone adds nothing', (await cartLines()).length === 0);
await page.selectOption('#order-size', 'S');
await settle();
{
	const lines = await cartLines();
	check('a size puts the chosen variant in the cart', lines.length === 1 && lines[0].colour === 'green' && lines[0].size === 'S' && lines[0].quantity === 1, JSON.stringify(lines));
	check('the panel prices it', await shows(/Subtotal\s*\$27\.99/), await totals());
	check('and shows the costume’s own price beside it', (await page.locator('.classic-product .amount').innerText()) === '$27.99');
	check('and shows that size’s band', (await page.locator('.classic-size-note').innerText()).includes('S · 1.5–2.5 kg'));
}
await page.selectOption('#order-size', 'M');
await page.selectOption('#order-qty', '2');
await settle();
{
	const lines = await cartLines();
	check('a new size replaces the line', lines.length === 1 && lines[0].size === 'M', JSON.stringify(lines));
	check('quantity 2 is two costumes', lines[0]?.quantity === 2, JSON.stringify(lines));
	check('at the server’s bundle price', await shows(/Bundle discount[\s\S]*Total\s*USD\s*\$52\.06/), await totals());
	check('the item count follows', (await page.locator('.classic-order-head').innerText()).includes('2 items'));
	check('the costume’s own price is for two', (await page.locator('.classic-product .amount').innerText()) === '$55.98');
	const add = await pairedOnce('AddToCart');
	check('the one AddToCart is the first choice', JSON.stringify(add.content_ids) === '["CMP-XT-GREEN-S"]', JSON.stringify(add));
}
check('shipping is free', await shows(/Shipping\s*FREE[\s\S]*\$52\.06/), await totals());
check('and the total by the button follows', (await page.locator('.classic-due').innerText()).includes('$52.06'));

// --- errors --------------------------------------------------------------------------
await page.fill('#contact-email', 'tree@example.com');
await settle();
await pairedOnce('InitiateCheckout');
await page.locator('.classic-payb').click();
await page.waitForTimeout(400);
check('pay with fields missing posts nothing', posts.length === 0);
{
	const invalid = await page.locator('.classic [aria-invalid="true"]').evaluateAll((els) => els.map((e) => e.id));
	check('each missing field is marked', ['shipping-firstName', 'shipping-lastName', 'shipping-address', 'shipping-city', 'shipping-state', 'shipping-zip'].every((id) => invalid.includes(id)), JSON.stringify(invalid));
	check('the email that was typed is not', !invalid.includes('contact-email'));
	check('with its message under it', (await page.locator('#shipping-firstName-error').innerText()).includes('first name'));
	check('focus goes to the first one', (await page.evaluate(() => document.activeElement?.id)) === 'shipping-firstName');
	check('and a line by the button says why', (await page.locator('.classic-form .shop-alert').innerText()).includes('missing'));
}

// --- the order -----------------------------------------------------------------------
await page.fill('#shipping-firstName', 'Mary Ann');
await page.fill('#shipping-lastName', 'Holly');
await page.fill('#shipping-address', '751 Pine St');
await page.locator('.classic-more').click();
await page.fill('#shipping-address2', 'Apt 2');
await page.fill('#shipping-city', 'Austin');
await page.selectOption('#shipping-state', 'TX');
await page.fill('#shipping-zip', '73301');
check('the message clears once the field is filled', (await page.locator('#shipping-firstName-error').count()) === 0);
await page.selectOption('#order-size', 'L');
await page.selectOption('#order-size', 'M');
await settle();
check('changing the size after starting is still one checkout', (await browserEvent('InitiateCheckout')).length === 1);
check('and still one add', (await browserEvent('AddToCart')).length === 1);
await page.locator('.classic-payb').click();
await page.getByRole('heading', { name: /order received/i }).waitFor({ timeout: 20000 }).catch(() => {});
const body = (await page.textContent('body')) ?? '';
const orderNumber = /CMP-[0-9A-F]{8}/.exec(body)?.[0];
check('the order was accepted', Boolean(orderNumber), body.slice(0, 300));
{
	const db = createClient({
		url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
		authToken: process.env.TURSO_AUTH_TOKEN
	});
	const rows = await db.execute({
		sql: `select o.first_name, o.last_name, o.address2, o.province, o.country, o.shipping_method,
		             o.total_cents, oi.sku, oi.quantity
		      from orders o join order_items oi on oi.order_id = o.id
		      where o.order_number = ?`,
		args: [orderNumber ?? '']
	});
	const row = rows.rows[0] ?? {};
	check('the names are stored as typed', row.first_name === 'Mary Ann' && row.last_name === 'Holly', JSON.stringify(row));
	check('with the apartment, state and country', row.address2 === 'Apt 2' && row.province === 'TX' && row.country === 'US', JSON.stringify(row));
	check('two green M costumes, standard, at the bundle price', rows.rows.length === 1 && row.sku === 'CMP-XT-GREEN-M' && Number(row.quantity) === 2 && row.shipping_method === 'standard' && Number(row.total_cents) === 5206, JSON.stringify(row));
	db.close();
}
{
	const purchase = (await browserEvent('Purchase'))[0];
	check('Purchase carries the order-derived event id', purchase?.[3]?.eventID === `purchase-${orderNumber}`, JSON.stringify(purchase?.[3]));
	check('Purchase is never posted to /api/track', serverCopy('Purchase').length === 0);
	check('the cart is empty after the order', (await cartLines()).length === 0);
}

// --- a desktop -----------------------------------------------------------------------
{
	const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	await quiet(desk);
	const p = await desk.newPage();
	const errors = watch(p);
	await p.goto(`${BASE}${PATH}?design=red&size=L`, { waitUntil: 'networkidle' });
	const [main, aside] = await Promise.all([
		p.locator('.classic-main').boundingBox(),
		p.locator('.classic-order').boundingBox()
	]);
	check('the order panel sits beside the form', aside.x > main.x + main.width - 2 && Math.abs(aside.y - main.y) < 2, JSON.stringify({ main, aside }));
	check('its total is on the first screen', (await p.locator('.classic-totals .total').boundingBox()).y < 900);
	check('nothing is wider than the window', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	check('the link’s choice is in the cart', await p.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]').some((l) => l.colour === 'red' && l.size === 'L')));
	check('no page errors on the desktop', errors.length === 0, errors.join('; '));
	await desk.close();
}

// --- arriving from the product page's Add to cart -------------------------------
{
	const c = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true });
	await quiet(c);
	const p = await c.newPage();
	await p.goto(`${BASE}${PATH}?design=red&size=L&bundle=qty-2&added=1`, { waitUntil: 'networkidle' });
	check('the hand-off link chooses colour, size and quantity', (await p.inputValue('#order-design')) === 'red' && (await p.inputValue('#order-size')) === 'L' && (await p.inputValue('#order-qty')) === '2');
	check('and the cart holds them', await p.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]').some((l) => l.colour === 'red' && l.size === 'L' && l.quantity === 2)));
	const sent = await p.evaluate(() => (window.fbq?.queue ?? []).map((a) => a[1]));
	check('the product page counted the view and the add, so this page sends neither', !sent.includes('ViewContent') && !sent.includes('AddToCart'), JSON.stringify(sent));
	check('the link is cleared from the address bar once read', new URL(p.url()).search === '', p.url());
	await c.close();
}

// --- the Payment Element (only with PAYMENTS_BASE_URL) ------------------------------
// A second dev server with STRIPE_PUBLISHABLE_KEY and a dummy STRIPE_SECRET_KEY
// (no order is placed), as for tests/shop-checkout.mjs. Loads the real Stripe.js.
if (process.env.PAYMENTS_BASE_URL) {
	const PAY = process.env.PAYMENTS_BASE_URL;
	for (const [label, viewport] of [
		['phone', { width: 390, height: 664 }],
		['desktop', { width: 1280, height: 900 }]
	]) {
		const c = await browser.newContext({ viewport, isMobile: label === 'phone', hasTouch: label === 'phone' });
		await quiet(c);
		const p = await c.newPage();
		await p.goto(`${PAY}${PATH}?design=green&size=M`);
		const tops = new Set();
		const deadline = Date.now() + 15000;
		let ready = false;
		while (Date.now() < deadline) {
			const state = await p.evaluate(() => {
				const btn = document.querySelector('button.classic-payb');
				const frame = document.querySelector('.classic-pay-box iframe');
				return { top: btn ? Math.round(btn.getBoundingClientRect().top + scrollY) : null, frame: frame ? frame.getBoundingClientRect().height : 0 };
			});
			if (state.top !== null) tops.add(state.top);
			if (state.frame > 100) {
				ready = true;
				await p.waitForTimeout(1500);
				tops.add(await p.evaluate(() => Math.round(document.querySelector('button.classic-payb').getBoundingClientRect().top + scrollY)));
				break;
			}
			await p.waitForTimeout(100);
		}
		check(`${label}: the Payment Element loads inside the card box`, ready);
		check(`${label}: the pay button does not move while it loads`, tops.size === 1, [...tops].join(' → '));
		let offered = '';
		for (const f of p.frames()) {
			if (!f.url().includes('js.stripe.com/v3/elements-inner')) continue;
			offered += await f.evaluate(() => document.body.innerText).catch(() => '');
		}
		check(`${label}: the form offers cards`, /Card number/.test(offered), offered.slice(0, 120));
		check(`${label}: and no Link, Google Pay or Discover`, !/\bLink\b|Google Pay|Discover/.test(offered), offered.slice(0, 300));
		await p.locator('.classic-pay').screenshot({ path: `${process.env.SCREENSHOT_DIR ?? '/tmp'}/classic-pay-${label}.png` }).catch(() => {});
		await c.close();
	}

	const blocked = await browser.newContext({ viewport: { width: 390, height: 664 } });
	await quiet(blocked);
	await blocked.route('**/js.stripe.com/**', (route) => route.abort());
	const p = await blocked.newPage();
	await p.goto(`${PAY}${PATH}?design=green&size=M`);
	const note = await p
		.locator('.shop-notice', { hasText: /Stripe/ })
		.waitFor({ timeout: 15000 })
		.then(() => true)
		.catch(() => false);
	check('Stripe.js blocked: the hosted page is offered instead of dead card fields', note);
	check('and the form tells the server the card fields are not there', (await p.locator('input[name="cardReady"]').inputValue()) === '0');
	await blocked.close();
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
