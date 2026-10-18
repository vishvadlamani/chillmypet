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
// Same for GA4's hits: with GTM_CONTAINER_ID set, the live container fires real
// page views for 127.0.0.1 into property G-YCFPQ38SXP, and on a network that
// never answers google.com the open beacon also keeps `networkidle` from ever
// arriving. gtm.js itself still loads, which is what the GTM checks below read.
await ctx.route('**/google.com/g/collect*', (route) => route.abort());
await ctx.route('**/google-analytics.com/**', (route) => route.abort());
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
 * PageViews on the page.
 *
 * Every pixel is initialised by the one snippet in app.html, so a single
 * `track('PageView')` reports to all of them — the count is per page view, not
 * per pixel.
 */
const pageViews = (calls) => calls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length;

// The dataset the live ad account (1550461850095009) optimises against, so the
// only one that also gets the Conversions API copy.
const STORE_PIXEL = '1341978141149107';
const ALL_PIXELS = [STORE_PIXEL];
// Initialised until 2026-10-11: one nobody could say whose it was, and the
// retired CZK ad account's, which nothing running used. Asserted absent,
// because every pixel on the page receives every visitor's browsing.
const REMOVED_PIXELS = ['28272021345717397', '1363695699271757'];

// `detail` is printed only on failure. Several assertions already passed one
// and it was being dropped, so a failing pixel or eventID check reported the
// label and nothing about what it actually saw.
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
	if (!cond) {
		if (detail !== undefined) console.log(`      got: ${detail}`);
		process.exitCode = 1;
	}
}

// --- server-rendered HTML, before any JavaScript runs ---
// Playwright hydrates, so every assertion below this block sees a page that has
// already run its effects. That blind spot shipped a product page whose SSR
// output said "Sold out" with no variant selected, which is what crawlers, slow
// connections and no-JS visitors got. Assert on the raw bytes.
{
	const html = await fetch(PRODUCT).then((r) => r.text());
	check('SSR renders the product title', /<title>Dog Life Jacket/.test(html));
	check('SSR carries a description for search and social', /name="description" content=".{40}/.test(html));
	check('SSR quotes a price', /\$\d+\.\d{2}/.test(html));
	check('SSR offers a way to buy', /Buy now/i.test(html) && !/Sold out/i.test(html));
	check('SSR renders the bundle picker', /Choose your bundle/.test(html));
	// The sales-page furniture went with the redesign (2026-10-17): no
	// per-visitor countdown, no "today only", no scarcity bar, and no
	// struck-through price the jacket never sold at.
	const body = html.replace(/<style[\s\S]*?<\/style>/g, '');
	check('no countdown, "today only" or "% sold" on the page', !/sale ends|today only|% sold|left in stock/i.test(body));
	check('no was-price or strikethrough price', !/<s>|<del>|line-through/i.test(body));
	check('the price is $44.99', body.includes('$44.99'));
	check('the page wears the shop’s look', /class="tree-strip/.test(html) && /tree-theme/.test(html));

	// The words are invented and the rating was never counted. They must not
	// reach a shopper — see $lib/store/reviews-wall.ts.
	check(
		'SSR ships no invented reviews',
		!/1,127|Pet Parents|What owners are saying|500\+ dogs/.test(html)
	);
	check('the page is indexable', !/noindex/.test(html));

	// Both tags ship server-rendered, on every page, before any JavaScript runs.
	check('SSR carries the GTM container', /googletagmanager\.com\/gtm\.js/.test(html));
	check('and its noscript iframe', /ns\.html\?id=GTM-T446VNH9/.test(html));
	// One container, and only one. The site shipped GTM-N3Q25P9X for a while and
	// the id moved on without the deploy following, so every tag anyone built was
	// being published into a container the pages no longer loaded.
	const containers = [...new Set(html.match(/GTM-[A-Z0-9]{4,12}/g) ?? [])].join(',');
	check('and no other container is loaded alongside it', containers === 'GTM-T446VNH9', containers || 'no container at all');
	// Asserted through the constants, so adding a pixel to the roster is one
	// edit rather than one here and one silently-stale literal.
	for (const id of ALL_PIXELS) {
		check(`SSR initialises pixel ${id}`, html.includes(`fbq('init', '${id}'`));
	}
	for (const id of REMOVED_PIXELS) {
		check(`SSR no longer mentions the removed pixel ${id}`, !html.includes(id));
	}

	// One visitor id on every init, the same one each Conversions API copy
	// sends as external_id. Shaped like a SHA-256 digest so the pixel passes it
	// through rather than hashing it, which is what makes the halves agree.
	const ids = [...html.matchAll(/fbq\('init', '\d+', \{external_id: '([a-f0-9]{64})'\}\)/g)].map((m) => m[1]);
	check('every init carries the external_id', ids.length === ALL_PIXELS.length, `${ids.length} of ${ALL_PIXELS.length}`);
	check('and it is one id, not one per pixel', new Set(ids).size === 1, JSON.stringify(ids));
}

{
	const html = await fetch(`${BASE}/checkout`).then((r) => r.text());
	check('SSR renders the checkout forms', /Contact/.test(html) && /Shipping address/.test(html));
	check('SSR renders the pay button', /Place order|Pay \$/.test(html));
	check('checkout stays out of search results', /noindex/.test(html));
}

{
	// The header is Home, Catalog (All products, Christmas) and Contact, and the
	// catalogue is built from the store: one card per product with both a row
	// and a page manifest, not unlisted. Asserted on the raw HTML, because a nav
	// a crawler cannot see is a nav nobody arriving cold can see either.
	const html = await fetch(BASE).then((r) => r.text());
	const header = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
	check(
		'the header reads Home, Catalog, Contact',
		['href="/"', 'href="/catalog"', 'href="/christmas"', 'href="/contact"'].every((h) => header.includes(h)) &&
			!header.includes('href="/products/'),
		header.slice(0, 400)
	);
	const catalog = await fetch(`${BASE}/catalog`).then((r) => r.text());
	check(
		'the catalogue links to every listed product page',
		['dog-life-jacket', 'dog-christmas-costume', 'reindeer-dog-hoodie'].every((s) => catalog.includes(`href="/products/${s}"`))
	);
	check('and the home page does too', html.includes('href="/products/dog-life-jacket"') && html.includes('href="/products/dog-christmas-costume"'));
	const contact = await fetch(`${BASE}/contact`);
	check('/contact answers', contact.status === 200);
}
{
	// The brand's own look everywhere but Christmas (2026-10-17): the logo in
	// the header, and the navy/teal skin on the shop's pages, while /christmas
	// and the Christmas products keep the pine and cream.
	const skinned = async (path) => {
		const html = await fetch(`${BASE}${path}`).then((r) => r.text());
		return { html, brand: /class="[^"]*\bbrand-skin\b/.test(html) };
	};
	const home = await skinned('/');
	check('the header shows the logo', /<header[\s\S]*?src="\/brand\/logo\.png"[\s\S]*?<\/header>/.test(home.html));
	check('the tab icon is the brand paw, not SvelteKit’s', home.html.includes('/brand/favicon-32.png') && !home.html.includes('favicon.svg'));
	for (const path of ['/', '/catalog', '/contact', '/checkout', '/products/dog-life-jacket']) {
		check(`${path} wears the brand skin`, (await skinned(path)).brand);
	}
	for (const path of ['/christmas', '/products/dog-christmas-costume', '/products/reindeer-dog-hoodie']) {
		check(`${path} keeps the Christmas colours`, !(await skinned(path)).brand);
	}
	check('the life jacket card shows its whole photo', /<figure class="[^"]*\bcontain\b[^"]*"[^>]*>(?:<!--[^>]*-->|\s)*<img[^>]*card-sailboat/.test(home.html));
}
{
	// "Teal", the owner's pick of four previews (2026-10-18): the round logo's
	// teal for the bands, navy for what you press and for prices, the orange
	// for the small headings. The Christmas pages keep their own.
	const p = await browser.newPage();
	const look = (sel, prop) => p.locator(sel).first().evaluate((e, k) => getComputedStyle(e)[k], prop);
	await p.goto(BASE, { waitUntil: 'load' });
	check('teal: the home banner is the logo’s teal', (await look('.hero-band', 'backgroundColor')) === 'rgb(18, 133, 143)');
	check('teal: its title is white', (await look('.hero-band h1', 'color')) === 'rgb(255, 255, 255)');
	check('teal: its first button is orange with navy lettering', (await look('.hero-band .actions a', 'backgroundColor')) === 'rgb(255, 107, 44)' && (await look('.hero-band .actions a', 'color')) === 'rgb(11, 60, 73)');
	check('teal: card buttons are navy', (await look('.card .cta', 'backgroundColor')) === 'rgb(11, 60, 73)');
	check('teal: prices are navy', (await look('.card .price', 'color')) === 'rgb(11, 60, 73)');
	check('teal: the small headings are the logo’s orange', (await look('.collection .eyebrow', 'color')) === 'rgb(255, 107, 44)');
	check('teal: the footer is teal', (await look('footer.site-footer', 'backgroundColor')) === 'rgb(18, 133, 143)');
	check('teal: with the all-white logo', (await p.locator('footer img').first().getAttribute('src')) === '/brand/logo-white.png');
	await p.goto(`${BASE}/products/dog-life-jacket`, { waitUntil: 'load' });
	check('teal: the life jacket’s trust band is teal', (await look('section.trust-strip', 'backgroundColor')) === 'rgb(18, 133, 143)');
	check('teal: and its Buy now is navy', (await look('button:has-text("Buy now")', 'backgroundColor')) === 'rgb(11, 60, 73)');
	await p.goto(`${BASE}/christmas`, { waitUntil: 'load' });
	check('Christmas keeps its pine footer and light logo', (await look('footer.site-footer', 'backgroundColor')) !== 'rgb(18, 133, 143)' && (await p.locator('footer img').first().getAttribute('src')) === '/brand/logo-light.png');
	await p.close();
}
{
	// The Catalog menu is a disclosure: closed until tapped, shut by Escape.
	const p = await browser.newPage();
	await p.goto(BASE, { waitUntil: 'networkidle' });
	const menu = p.locator('header .catalog-menu');
	const allProducts = menu.locator('a[href="/catalog"]');
	check('the Catalog menu starts closed', !(await allProducts.isVisible()));
	await menu.locator('summary').click();
	check('a tap opens it on All products', await allProducts.isVisible());
	await p.keyboard.press('Escape');
	check('and Escape shuts it', !(await allProducts.isVisible()));
	await menu.locator('summary').click();
	await menu.locator('a[href="/christmas"]').click();
	await p.waitForURL('**/christmas');
	check('following a link lands there with the menu shut', !(await menu.evaluate((d) => d.open)));
	await p.close();
}
{
	// On a phone the menu folds behind a button, and a checkout has none.
	const ctxPhone = await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
	const p = await ctxPhone.newPage();
	await p.goto(BASE, { waitUntil: 'networkidle' });
	check('a phone gets the menu button, not the bar', (await p.locator('.phone-menu summary').isVisible()) && !(await p.locator('header nav > ul').isVisible()));
	await p.locator('.phone-menu summary').tap();
	check('which opens on the shop’s pages', await p.locator('.phone-menu a[href="/catalog"]').isVisible() && (await p.locator('.phone-menu a[href="/contact"]').isVisible()));
	check('and on the language switch', await p.locator('.phone-menu button[value="es"]').isVisible());
	check('the header keeps to one row on a phone', (await p.locator('header.site-header').evaluate((h) => h.getBoundingClientRect().height)) <= 64);
	await p.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
	check('a checkout has no menu button', (await p.locator('.phone-menu').count()) === 0);
	check('but keeps the language switch', await p.locator('header button[value="es"]').isVisible());
	await ctxPhone.close();
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
	// The browser keeps its id across pages: a new one per page view would tie
	// nothing together.
	const vid = (await ctx.cookies()).find((c) => c.name === 'cmp_vid');
	check('the visitor id is a first-party cookie', /^[a-f0-9]{64}$/.test(vid?.value ?? ''), JSON.stringify(vid));
	check('that page script cannot read', vid?.httpOnly === true);
	check(
		'and the pixel was initialised with it',
		calls.find((c) => c[0] === 'init' && c[1] === STORE_PIXEL)?.[2]?.external_id === vid?.value,
		JSON.stringify(calls.find((c) => c[0] === 'init'))
	);
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
	check('AddToCart is worth the whole bundle', addToCart?.[2]?.value === '134.97');
	check('AddToCart carries variant skus', /^CMP-LJ-/.test(addToCart?.[2]?.content_ids?.[0] ?? ''));
	check(
		'one AddToCart per click, not one per unit',
		calls.filter((c) => c[0] === 'track' && c[1] === 'AddToCart').length === 1
	);
}

// --- checkout ---
await page.waitForSelector('form dl');
const summary = await page.textContent('form dl');
check('subtotal is 3 x 44.99', summary?.includes('$134.97'));
check('the 3-pack discount is applied', summary?.includes('$12.15'));

{
	const calls = await fbqCalls();

	// Other ad accounts measure the same pages. Every pixel is initialised by
	// the one snippet, so each event above reaches all of them — and each is
	// initialised exactly once, since a repeat init resets that pixel's state.
	for (const id of ALL_PIXELS) {
		check(`pixel ${id} initialises`, calls.some((c) => c[0] === 'init' && c[1] === id));
	}
	check(
		'no pixel is initialised twice',
		calls.filter((c) => c[0] === 'init').length === ALL_PIXELS.length,
		JSON.stringify(calls.filter((c) => c[0] === 'init').map((c) => c[1]))
	);

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
	check('InitiateCheckout value is subtotal', initiate?.[2]?.value === '134.97');
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

// The same cart, reached again. A reload, a back-navigation and the bounce back
// from Stripe's cancel url are all one checkout start, and the guard that says
// so is keyed on the cart and kept in sessionStorage — the cart itself is in
// localStorage and outlives the page, which is what made a plain per-mount flag
// report several starts for every real one.
check(
	'a reload does not report a second checkout start',
	!tracked(await fbqCalls(), 'InitiateCheckout')
);

// Client-side navigation must also record a PageView. fbq.queue survives here
// because SvelteKit navigates without a document reload. The checkout has no
// product menu, so the way back is the order box's own "Change" link.
check('the checkout has no product menu', !(await page.locator('header nav > ul').isVisible()));
await page.click('section[aria-label="Your order"] a[href="/products/dog-life-jacket"]');
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
