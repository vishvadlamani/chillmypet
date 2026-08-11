import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
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

const tracked = (calls, event) =>
	calls.find((c) => c[0] === 'track' && c[1] === event);

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
	const html = await fetch(`${BASE}/products/dog-life-jacket`).then((r) => r.text());
	check('SSR selects a variant', !/Dog Life Jacket in ,/.test(html));
	check('SSR offers a buyable default', /Add to cart/i.test(html) && !/Sold out/i.test(html));
	check('SSR checks a colour radio', /name="colour"[^>]*checked/.test(html));
	check('SSR checks a size radio', /name="size"[^>]*checked/.test(html));
}

// --- product page ---
await page.goto(`${BASE}/products/dog-life-jacket`, { waitUntil: 'networkidle' });
check('title renders', (await page.textContent('h1'))?.includes('Dog Life Jacket'));
check('cart badge starts at 0', (await page.textContent('header a[href="/checkout"]'))?.includes('0'));

// pick a colour + size
await page.locator('input[name="colour"][value="blue_camo"]').check({ force: true });
await page.locator('input[name="size"][value="L"]').check({ force: true });
check('colour label updates', (await page.textContent('fieldset legend'))?.includes('Blue Camo'));

// Quantity moved off the product page — the buy box is one decision now, and
// the cart merges repeat adds of the same variant.
await page.getByRole('button', { name: /add to cart/i }).first().click();
await page.waitForTimeout(250);
await page.getByRole('button', { name: /add to cart/i }).first().click();
await page.waitForTimeout(400);
const badge = await page.textContent('header a[href="/checkout"]');
check('cart badge shows 2', badge?.includes('2'));

// Sold out: yellow is stocked in XL only.
await page.locator('input[name="colour"][value="yellow"]').check({ force: true });
await page.waitForTimeout(200);
check(
	'sold-out size is disabled',
	await page.locator('input[name="size"][value="XS"]').isDisabled()
);
check(
	'stocked size stays selectable',
	await page.locator('input[name="size"][value="XL"]').isEnabled()
);

// Never offered: purple has no XL variant at all.
await page.locator('input[name="colour"][value="purple"]').check({ force: true });
await page.waitForTimeout(200);
check(
	'unoffered combination is disabled',
	await page.locator('input[name="size"][value="XL"]').isDisabled()
);

// Real photography is wired up per colour.
const heroSrc = await page.locator('article img').first().getAttribute('src');
check('gallery renders a real image', heroSrc?.includes('/products/dog-life-jacket/'));
const heroOk = await page.evaluate(() => {
	const img = document.querySelector('article img');
	return Boolean(img && img.naturalWidth > 100);
});
check('gallery image actually loaded', heroOk);

// Re-select the in-stock combination for the rest of the run.
await page.locator('input[name="colour"][value="blue_camo"]').check({ force: true });
await page.locator('input[name="size"][value="L"]').check({ force: true });
await page.waitForTimeout(200);

{
	const calls = await fbqCalls();
	check('pixel init fired', calls.some((c) => c[0] === 'init' && c[1] === '28272021345717397'));
	check('PageView fired', Boolean(tracked(calls, 'PageView')));
	check('ViewContent fired', Boolean(tracked(calls, 'ViewContent')));
	const addToCart = tracked(calls, 'AddToCart');
	check('AddToCart fired', Boolean(addToCart));
	// One AddToCart per click now, each for a single unit — two clicks is
	// two events, not one event carrying two.
	check('AddToCart value is one unit', addToCart?.[2]?.value === '44.97');
	check(
		'each add fires its own AddToCart',
		calls.filter((c) => c[0] === 'track' && c[1] === 'AddToCart').length === 2
	);
	check('AddToCart carries the variant sku', addToCart?.[2]?.content_ids?.[0] === 'CMP-LJ-BLUE_CAMO-L');
}

await page.screenshot({ path: shot('product.png'), fullPage: false });

// --- cart survives reload ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check(
	'cart persists across reload',
	(await page.textContent('header a[href="/checkout"]'))?.includes('2')
);

// --- checkout ---
await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const summary = await page.textContent('aside');
check('summary lists product', summary?.includes('Dog Life Jacket'));
check('summary shows blue camo / L', summary?.includes('Blue Camo') && summary?.includes('L'));
check('subtotal is 2 x 44.97', summary?.includes('$89.94'));

// express shipping updates total
await page.locator('input[name="method"][value="express"]').check();
await page.waitForTimeout(200);
const withExpress = await page.textContent('aside');
check('express total 89.94 + 12.00', withExpress?.includes('$101.94'));

{
	const calls = await fbqCalls();
	const initiate = tracked(calls, 'InitiateCheckout');
	check('InitiateCheckout fired', Boolean(initiate));
	check('InitiateCheckout value is subtotal', initiate?.[2]?.value === '89.94');
}

await page.screenshot({ path: shot('checkout.png'), fullPage: false });

// submit with a bad email -> inline error, values retained
await page.fill('input[name="email"]', 'nope');
await page.fill('input[name="firstName"]', 'Vish');
await page.fill('input[name="lastName"]', 'Adlamani');
await page.fill('input[name="address1"]', '12 Harbour Way');
await page.fill('input[name="city"]', 'Lisbon');
await page.fill('input[name="postalCode"]', '1100-001');
await page.selectOption('select[name="country"]', 'PT');
await page.locator('input[name="email"]').evaluate((el) => el.setAttribute('type', 'text'));
await page.getByRole('button', { name: /place order/i }).click();
await page.waitForTimeout(900);
const afterFail = await page.content();
check('invalid email shows error', afterFail.includes('Enter a valid email address'));
check('address retained after failure', (await page.inputValue('input[name="city"]')) === 'Lisbon');
check('method retained after failure', await page.locator('input[name="method"][value="express"]').isChecked());

// fix email and submit for real
await page.fill('input[name="email"]', 'vish@example.com');
await page.getByRole('button', { name: /place order/i }).click();
await page.waitForTimeout(1500);
const done = await page.content();
check('order confirmation shown', done.includes('Order received'));
const orderNo = done.match(/CMP-[A-Z0-9]{8}/)?.[0];
check('order number rendered', Boolean(orderNo));
console.log('      order:', orderNo);
check('cart cleared after order', (await page.textContent('header a[href="/checkout"]'))?.includes('0'));
{
	const calls = await fbqCalls();
	const purchase = tracked(calls, 'Purchase');
	check('Purchase fired', Boolean(purchase));
	check('Purchase value includes express shipping', purchase?.[2]?.value === '101.94');
	check('Purchase currency', purchase?.[2]?.currency === 'USD');
	const eventId = purchase?.[3]?.eventID;
	check('Purchase carries an eventID for CAPI dedup', typeof eventId === 'string' && eventId.length > 20);
	check(
		'exactly one PageView on a full load',
		calls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length === 1
	);
}

// Client-side navigation must also record a PageView. fbq.queue survives here
// because SvelteKit navigates without a document reload.
await page.getByRole('link', { name: /keep shopping/i }).click();
await page.waitForURL('**/products/dog-life-jacket');
{
	const calls = await fbqCalls();
	check(
		'SPA navigation adds a second PageView',
		calls.filter((c) => c[0] === 'track' && c[1] === 'PageView').length === 2
	);
}

await page.screenshot({ path: shot('confirmation.png'), fullPage: false });

// --- language pack switch ---
await page.goto(`${BASE}/products/dog-life-jacket`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Español' }).click();
await page.waitForLoadState('networkidle');
check('html lang is es', (await page.getAttribute('html', 'lang')) === 'es');
check('product name translated', (await page.textContent('h1'))?.includes('Chaleco salvavidas'));
const esBody = await page.content();
check('size chart translated', esBody.includes('Contorno de pecho'));
check('colour names translated', esBody.includes('Camuflaje azul'));
await page.screenshot({ path: shot('product-es.png'), fullPage: false });

await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' });
check('checkout translated', (await page.textContent('h1')) === 'Finalizar compra');

console.log(pageErrors.length ? `\nPAGE ERRORS:\n${pageErrors.join('\n')}` : '\nNo page errors.');
if (pageErrors.length) process.exitCode = 1;

await browser.close();
