/**
 * Site-level browser checks: what the first response contains, what the pixel
 * fires, whether the cart survives, and whether the site still speaks Spanish.
 *
 * The funnel itself — product → checkout → order — is tests/store-flow.mjs.
 * Splitting them keeps this file about the things that are true of the site
 * regardless of which page is selling today, which is what let the product page
 * be replaced without rewriting the assertions that mattered.
 *
 *   node tests/e2e.mjs
 *
 * Expects a dev server with no STRIPE_SECRET_KEY.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const PRODUCT = `${BASE}/products/dog-life-jacket`;
const shotDir = new URL('./screenshots/', import.meta.url);
await mkdir(shotDir, { recursive: true });
const shot = (name) => new URL(name, shotDir).pathname;

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
// Block the real pixel lib: fbq stays a stub, so every call accumulates in
// fbq.queue where we can assert on it without touching Meta.
await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
await ctx.route('**/facebook.com/tr*', (route) => route.abort());
const pageErrors = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
	if (m.type() !== 'error') return;
	const text = m.text();
	// We abort the pixel requests ourselves; the resulting load errors aren't app bugs.
	if (text.includes('ERR_FAILED') || text.includes('net::')) return;
	pageErrors.push(`console: ${text}`);
});

const fbqCalls = () =>
	page.evaluate(() => (window.fbq?.queue ?? []).map((args) => Array.from(args)));

const tracked = (calls, event) => calls.find((c) => c[0] === 'track' && c[1] === event);

/**
 * PageViews on the page. One per page view: the snippet in app.html fires the
 * first, and `track('PageView')` fires one per client-side navigation.
 */
const pageViews = (calls) => calls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length;

const STORE_PIXEL = '1363695699271757';

function check(label, cond) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
	if (!cond) process.exitCode = 1;
}

// --- server-rendered HTML, before any JavaScript runs ---
// Playwright hydrates, so every assertion below this block sees a page that has
// already run its effects. That blind spot shipped a product page whose SSR
// output said "Sold out" with no variant selected, which is what crawlers, slow
// connections and no-JS visitors got. Assert on the raw bytes.
{
	const response = await fetch(PRODUCT);
	const html = await response.text();
	const setCookies = response.headers.getSetCookie?.().join('\n') ?? '';
	check('SSR renders the product title', /<title>Dog Life Jacket/.test(html));
	check('SSR carries a description for search and social', /name="description" content=".{40}/.test(html));
	check('SSR quotes a price', /\$\d+\.\d{2}/.test(html));
	check('SSR offers a way to buy', /Buy now/i.test(html) && !/Sold out/i.test(html));
	check('SSR renders the bundle picker', /Bundle &amp; Save|Bundle & Save/.test(html));

	// The words are invented and the rating was never counted. They must not
	// reach a shopper — see $lib/store/reviews-wall.ts.
	check(
		'SSR ships no invented reviews',
		!/1,127|Pet Parents|What owners are saying|500\+ dogs/.test(html)
	);
	check('the page is indexable', !/noindex/.test(html));

	// The Tag Manager container is gone. It published zero tags, so every page
	// paid for a runtime that read the dataLayer and did nothing with it — while
	// staying a surface anyone with container access could publish code from.
	check('no Tag Manager container', !/googletagmanager\.com\/gtm\.js/.test(html));
	check('and no container noscript iframe', !/googletagmanager\.com\/ns\.html/.test(html));

	// GA4 ships server-rendered like the pixel, and only when configured.
	const ga4 = html.match(/gtag\/js\?id=(G-[A-Z0-9]+)/)?.[1];
	check(
		'GA4 loads exactly when GA4_MEASUREMENT_ID says so',
		process.env.GA4_MEASUREMENT_ID ? ga4 === process.env.GA4_MEASUREMENT_ID : ga4 === undefined,
		`rendered ${ga4 ?? 'nothing'}, env ${process.env.GA4_MEASUREMENT_ID ?? 'unset'}`
	);
	// Advanced matching rides on `init` rather than on the event, so it applies
	// to the snippet's PageView and to everything the app fires after.
	const inits = html.match(/fbq\('init', '\d+'(?:, \{.*?\})?\);/g) ?? [];
	check('SSR initialises the store pixel', inits.some((i) => i.includes(`'${STORE_PIXEL}'`)));
	// One pixel, deliberately. A second would take browser events and no CAPI
	// copy, which is the half iOS and ad blockers eat.
	check('and only that pixel', inits.length === 1);

	// This request sent no cookies, and it still leaves with an identifier: the
	// visitor id is minted and set on the same response that renders this. It is
	// the only matching signal an anonymous PageView has, which is the whole
	// reason for it.
	check(
		'a first-time visitor already carries a hashed external_id',
		inits.length > 0 && inits.every((i) => /\{"external_id":"[0-9a-f]{64}"\}/.test(i))
	);
	check(
		'the visitor id is the same one the response sets',
		/(^|[,;\s])cmp_vid=[0-9a-f-]{36}/.test(setCookies) && /HttpOnly/i.test(setCookies)
	);

	// Meta reads a 64-character hex string as already hashed and passes it
	// through. Every value here has to be one, because this is page source: a
	// raw email in it is readable by every script on the page and by anything
	// that caches the HTML.
	const matching = inits.flatMap((line) => {
		const object = line.match(/\{.*\}/)?.[0];
		return object ? Object.values(JSON.parse(object)) : [];
	});
	check(
		'every advanced-matching value is a digest, never plaintext',
		matching.length > 0 && matching.every((v) => /^[0-9a-f]{64}$/.test(v))
	);
}

{
	const html = await fetch(`${BASE}/checkout`).then((r) => r.text());
	check('SSR renders the checkout forms', /Contact/.test(html) && /Shipping address/.test(html));
	check('SSR renders the pay button', /Place order|Pay \$/.test(html));
	check('checkout stays out of search results', /noindex/.test(html));
}

{
	const moved = await fetch(`${BASE}/store`, { redirect: 'manual' });
	check('the build URL redirects to the real one', moved.status === 308);
	check(
		'and lands on the product page',
		(moved.headers.get('location') ?? '').endsWith('/products/dog-life-jacket')
	);
}

// --- product page ---
await page.goto(PRODUCT, { waitUntil: 'networkidle' });
check('title renders', (await page.textContent('h1'))?.includes('Dog Life Jacket'));
check('cart badge starts at 0', (await page.textContent('header a[href="/checkout"]'))?.includes('0'));

// Gallery images are real files, not placeholders that 404.
const heroOk = await page.evaluate(() => {
	const img = document.querySelector('main img');
	return Boolean(img && img.naturalWidth > 100);
});
check('gallery image actually loaded', heroOk);

{
	const calls = await fbqCalls();
	check('pixel init fired', calls.some((c) => c[0] === 'init' && c[1] === STORE_PIXEL));
	check('PageView fired', Boolean(tracked(calls, 'PageView')));
	check('ViewContent fired', Boolean(tracked(calls, 'ViewContent')));
	check('ViewContent carries the product', tracked(calls, 'ViewContent')?.[2]?.content_ids?.[0] === 'dog-life-jacket');
}

await page.screenshot({ path: shot('product.png'), fullPage: false });

// --- the sticky bar must buy what the picker chose ---
// It sends a tier id and no quantity. Read that back wrong and someone who
// picked the 3-pack, scrolled, and tapped the bar buys one.
// The tiers are radio rows, so the label is the control.
await page.locator('label').filter({ hasText: /3 ×/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /buy now/i }).last().click();
await page.waitForURL('**/checkout', { timeout: 15000 });

const units = await page.evaluate(() =>
	JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]').reduce((n, l) => n + l.quantity, 0)
);
check('the sticky bar bought the chosen tier, not one unit', units === 3);
check('cart badge counts them', (await page.textContent('header a[href="/checkout"]'))?.includes('3'));

{
	const calls = await fbqCalls();
	const addToCart = tracked(calls, 'AddToCart');
	check('AddToCart fired', Boolean(addToCart));
	check('AddToCart is worth the whole bundle', addToCart?.[2]?.value === '134.91');
	check('AddToCart carries variant skus', /^CMP-LJ-/.test(addToCart?.[2]?.content_ids?.[0] ?? ''));
	check(
		'one AddToCart per click, not one per unit',
		calls.filter((c) => c[0] === 'track' && c[1] === 'AddToCart').length === 1
	);
}

// --- checkout ---
await page.waitForSelector('form dl');
const summary = await page.textContent('form dl');
check('subtotal is 3 x 44.97', summary?.includes('$134.91'));
check('the 3-pack discount is applied', summary?.includes('$12.14'));

{
	const calls = await fbqCalls();

	// The snippet initialises it once and the app only ever pushes events onto
	// it: a repeat init resets that pixel's state, and a second pixel would
	// collect browser events with no server copy behind them.
	check('the store pixel is still there', calls.some((c) => c[0] === 'init' && c[1] === STORE_PIXEL));
	check('the pixel is initialised exactly once', calls.filter((c) => c[0] === 'init').length === 1);

	// Every event has a server copy carrying this same id — the SSR snippet's
	// PageView from hooks.server.ts, the rest through /api/track. Without an id
	// on the browser half Meta counts the two copies as two events, so a missing
	// one inflates the dataset rather than merely failing to dedupe.
	const tracks = calls.filter((c) => c[0] === 'track');
	check(
		'every pixel event carries an eventID for CAPI dedup',
		tracks.length > 0 && tracks.every((c) => typeof c[3]?.eventID === 'string' && c[3].eventID),
		JSON.stringify(tracks.map((c) => [c[1], c[3]?.eventID]))
	);

	const initiate = tracked(calls, 'InitiateCheckout');
	check('InitiateCheckout fired', Boolean(initiate));
	check('InitiateCheckout value is subtotal', initiate?.[2]?.value === '134.91');
	check('InitiateCheckout counts the units', initiate?.[2]?.num_items === 3);
}

await page.screenshot({ path: shot('checkout.png'), fullPage: false });

// --- cart survives reload ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check(
	'cart persists across reload',
	(await page.textContent('header a[href="/checkout"]'))?.includes('3')
);
check(
	'exactly one PageView on a full load',
	pageViews(await fbqCalls()) === 1
);

// Client-side navigation must also record a PageView. fbq.queue survives here
// because SvelteKit navigates without a document reload.
await page.click('header a[href="/products/dog-life-jacket"]');
await page.waitForURL('**/products/dog-life-jacket', { timeout: 10000 });
{
	const calls = await fbqCalls();
	check(
		'SPA navigation adds a second PageView',
		pageViews(calls) === 2
	);
}

// --- language pack switch ---
await page.goto(PRODUCT, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Español' }).click();
await page.waitForLoadState('networkidle');
check('html lang is es', (await page.getAttribute('html', 'lang')) === 'es');
check('product name translated', (await page.textContent('h1'))?.includes('Chaleco salvavidas'));
await page.screenshot({ path: shot('product-es.png'), fullPage: false });

await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
check('checkout translated', (await page.textContent('h1')) === 'Finalizar compra');
check('checkout forms translated', (await page.content()).includes('Dirección de envío'));

// --- the pages the page links to must exist ---
for (const path of ['/policies/shipping', '/policies/refunds', '/privacy', '/terms', '/contact']) {
	const res = await fetch(`${BASE}${path}`);
	check(`${path} resolves`, res.status === 200);
}

console.log(pageErrors.length ? `\nPAGE ERRORS:\n${pageErrors.join('\n')}` : '\nNo page errors.');
if (pageErrors.length) process.exitCode = 1;

await browser.close();
