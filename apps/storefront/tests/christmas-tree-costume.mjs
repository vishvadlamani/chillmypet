/**
 * The Christmas Tree Costume, product page to placed order, on a
 * phone-sized screen.
 *
 *   node tests/christmas-tree-costume.mjs
 *
 * What it pins down, because none of it is visible to a type check:
 *   - the first response: delivery strip, the pet's-size note, the weight
 *     guide from the catalogue, none of the things this page must never carry
 *     (countdown chips, was-prices, stock bars, ratings), and the header link
 *   - no size, no sale: buying without a size prompts and adds nothing
 *   - the ad's URL is this page, with no card fields on it; Add to cart opens
 *     the costume's own payment page with the choice in the link
 *   - the chosen colour AND size become the cart line, the checkout line, the
 *     order row and every tracking payload, re-priced by the server
 *   - tracking: ViewContent and AddToCart each reach Meta twice (browser +
 *     /api/track) under ONE event id; the SKU names colour and size
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, like tests/store-flow.mjs.
 */
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
// Where the Christmas costume ad points.
const URL_ = `${BASE}/products/christmas-tree-costume`;
const PRICE = '27.99';
const SKU = 'CMP-XT-GREEN-M';

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- the first response, before any JavaScript --------------------------------
// The ad's click: the product page itself, no redirect, and the click id
// kept as _fbc on that first response (fbclid is how Meta ties it to a sale).
{
	const res = await fetch(`${URL_}?fbclid=IwARtest123&utm_source=facebook`, {
		redirect: 'manual',
		headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS]' }
	});
	check('the ad’s URL is the product page, not a redirect', res.status === 200, `${res.status} ${res.headers.get('location') ?? ''}`);
	check('and keeps the click id as _fbc', /_fbc=fb\.\d\.\d+\.IwARtest123/.test(res.headers.get('set-cookie') ?? ''), res.headers.get('set-cookie') ?? '');
}
{
	const res = await fetch(URL_);
	const html = await res.text();
	check('the page serves', res.status === 200, String(res.status));
	check('no payment on the product page: no card, email or address fields', !/id="contact-email"|id="shipping-|class="shop-pay|class="classic-payb/.test(html));
	check('SSR carries the costume-only BOGO banner', /BUY ONE, GET ONE FREE[\s\S]{0,120}?Christmas Tree Costume/.test(html));
	check('SSR opens on the product: its title is the h1', /<h1[^>]*>[\s\S]{0,200}?Christmas Tree Costume/.test(html));
	check('and it is the only h1', (html.match(/<h1[\s>]/g) ?? []).length === 1);
	check('the gallery comes before the h1', html.indexOf('class="gallery') > -1 && html.indexOf('class="gallery') < html.search(/<h1[\s>]/));
	// The page opens on green, the original dog photo (`leadDesign` in pages.ts).
	check('the gallery opens on the original dog photo in the green costume', /class="frame[\s\S]{0,600}?green-dog-original\.jpg/.test(html));
	check('and green is the colour chosen', /name="design"[^>]*value="green"[^>]*checked|checked[^>]*name="design"[^>]*value="green"/.test(html) || /value="green"[^>]*checked/.test(html));
	check('the gallery carries every angle, not only the colours', /aria-label="Show photo 4: The green costume worn, with close-ups/.test(html));
	check('and counts them under the photo', /Swipe to explore[\s\S]{0,200}?1 \/ 4/.test(html));
	check('the two-dog scene is gone', !html.includes('duo.jpg'));
	check('the story section follows the buy box', /<h2[^>]*>[\s\S]{0,120}?steals the Christmas card/.test(html));
	check('the closing band points back at the picker, under an h2', /<h2[^>]*>[\s\S]{0,120}?Every tree needs a little one/.test(html) && /href="#variant-picker"/.test(html));
	check('SSR says the size goes by weight, in kg and lb', /By weight: S 1\.5–2\.5 kg \(3–6 lb\)/.test(html));
	check('the old quantity-discount cards are gone', !html.includes('Optional: save with a bundle') && !html.includes('$52.06') && !html.includes('$76.41'));
	check('the offer says what gets added', html.includes('in your selected colour and size'));
	check('the banner sits above the header', html.indexOf('tree-strip') < html.indexOf('<header'));
	check('SSR quotes the price', html.includes(`$${PRICE}`));
	check('SSR offers both colours', html.includes('>Red<') && html.includes('>Green<'));
	check('SSR has a size guide section', html.includes('id="size-guide"'));
	// Svelte stamps a scoping class on the cells, so match the tag loosely.
	check('the size guide is the supplier’s weight table', /<th scope="col"[^>]*>Weight<\/th>/.test(html) && /1\.5–2\.5 kg \(3–6 lb\)/.test(html));
	check('and carries no invented neck or back measurements', !/<th scope="col"[^>]*>(Neck|Back length)<\/th>/.test(html));
	check('no size is pre-selected', !/name="size"[^>]*checked/.test(html));
	check('no was-price or strikethrough price', !/compare|<s>|<del>/i.test(html.replace(/<style[\s\S]*?<\/style>/g, '')));
	check('no countdown chips, stock bar or viewers', !/sale ends|left in stock|viewing|people are|% sold/i.test(html));
	check('no ratings or reviews', !/★|Pet Parents|What owners are saying/.test(html));
	// The page body only: the header's menu leads to the catalogue.
	const main = /<main[\s\S]*?<\/main>/.exec(html)?.[0] ?? html;
	// The owner's rule since 2026-10-18: no "pet", "dog" or "cat" in what a
	// shopper reads. Tags and attributes (photo alt text, file names) aside;
	// "ChillMyPet" has no word boundary before "Pet", so it passes.
	const words = main.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ');
	check('the page says no pet, dog or cat', !/\b(pets?|dogs?|cats?|puppy|kitten)\b/i.test(words), /.{0,40}\b(pets?|dogs?|cats?|puppy|kitten)\b.{0,40}/i.exec(words)?.[0]);
	check('no life-jacket copy leaked in', !/chin rest|life jacket/i.test(main));
	check('og:image is absolute', /property="og:image" content="https?:\/\//.test(html));
	check('the Meta pixel is the dataset 1341978141149107', html.includes("fbq('init', '1341978141149107'"));
	check('SSR shows Apple Pay among the accepted payment methods', /aria-label="Apple Pay"/.test(html));
	check('and not Google Pay, which is off in Stripe', !/aria-label="Google Pay"/.test(html));
	check('and not Discover, which Stripe does not offer a Czech account', !/aria-label="Discover"/.test(html));
	check('SSR says who the shop is, in place of reviews', html.includes('Who you’re buying from') && html.includes('1–2 business days'));
	const header = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
	check('the site header leads to the catalogue', header.includes('href="/catalog"') && header.includes('href="/christmas"'), header.slice(0, 400));
}
{
	const html = await fetch(`${BASE}/catalog`).then((r) => r.text());
	check('and the catalogue links to this page', html.includes('href="/products/christmas-tree-costume"'));
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
// And GA4's hits: a test run is not a visit. See tests/e2e.mjs.
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
serverCopies.length = 0;
await page.reload({ waitUntil: 'networkidle' });

// --- the first screen, as the Facebook app on an iPhone shows it --------------
// 390×664 is what is left of an iPhone 13 under the app's own bars. The price
// and the size buttons have to be inside it: an ad that lands on a photo and
// nothing to tap is where 175 landing-page views turned into no adds.
{
	await page.setViewportSize({ width: 390, height: 664 });
	await page.evaluate(() => window.scrollTo(0, 0));
	const bottom = (sel) => page.locator(sel).first().evaluate((e) => e.getBoundingClientRect().bottom);
	const cta = await page.locator('#variant-picker button.cta').boundingBox();
	check('one purchase button and no bundle cards on mobile', (await page.locator('#variant-picker button.cta').count()) === 1 && (await page.locator('#variant-picker .tiers').count()) === 0);
	check('the portrait hero shows the whole costume', (await page.locator('.gallery .frame img').evaluate((e) => getComputedStyle(e).objectFit)) === 'contain');
	check('the price is on the first screen', (await bottom('#variant-picker .price')) <= 664);
	const sizes = await bottom('#size-picker label');
	check('and so are the size buttons', sizes <= 664, `they end at ${sizes}px`);
	check('the header keeps to one row on a phone', (await bottom('header')) <= 125);
	check('photos load as small copies', (await page.locator('.gallery .frame img').getAttribute('srcset'))?.includes('/resized/800/'));
	await page.setViewportSize({ width: 390, height: 844 });
}

// --- ViewContent ----------------------------------------------------------------
{
	const view = await pairedOnce('ViewContent');
	check('ViewContent names the product', JSON.stringify(view.data.content_ids) === '["christmas-tree-costume"]', JSON.stringify(view.data));
	check('ViewContent is worth the price', view.data.value === PRICE && view.data.currency === 'USD', JSON.stringify(view.data));
	const item = (await dataLayer()).find((e) => e.event === 'view_item')?.ecommerce?.items?.[0];
	check('view_item reached the dataLayer', item?.item_id === 'christmas-tree-costume', JSON.stringify(item));
}

// --- no size, no sale -------------------------------------------------------------
{
	await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
	const dock = page.locator('button', { hasText: /^\s*Get two costumes\s*$/ }).last();
	await dock.waitFor({ state: 'visible' });
	await dock.click();
	await page.locator('#size-error').filter({ hasText: /Pick a size first/ }).waitFor({ timeout: 5000 });
	check('buying without a size stays on the page', page.url().startsWith(URL_));
	check('nothing was added to the cart', (await cartLines()).length === 0);
	check('and no AddToCart was reported', (await browserEvent('AddToCart')).length === 0 && serverCopy('AddToCart').length === 0);
}

// --- pick colour and size ----------------------------------------------------------
// Browsing the extra photos must not change the colour, and picking a colour
// must bring its photo back to the front.
// On a phone the thumbnail strip gives way to arrows on the photo.
check('a phone gets arrows on the photo, not a thumbnail strip', !(await page.locator('.gallery .thumbs').isVisible()) && (await page.getByRole('button', { name: 'Next photo' }).isVisible()));
// Backwards from the first photo wraps to the extras without passing the red
// costume's photo, which would choose red: landing on a colour's photo chooses
// it, by design, so the frame and the picker never disagree.
await page.getByRole('button', { name: 'Previous photo' }).click();
check(
	'the gallery shows a photo of the whole product',
	(await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/details.jpg') &&
		/4 \/ 4/.test(await page.locator('.gallery .count').innerText())
);
check(
	'and browsing it leaves the colour alone',
	(await page.locator('#variant-picker input[name="design"]:checked').getAttribute('value')) === 'green'
);

check('the BOGO button quotes one costume’s price', (await page.locator('#variant-picker button.cta').innerText()).includes('$27.99'));
await page.locator('#variant-picker label', { hasText: 'Red' }).click();
check(
	'the gallery follows the colour',
	(await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/worn-red.jpg')
);
await page.locator('#variant-picker label', { hasText: 'Green' }).click();
check(
	'and back to the tabby for green',
	(await page.locator('.gallery .frame img').getAttribute('src'))?.endsWith('/green-dog-original.jpg')
);
await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
check('the error clears once a size is chosen', (await page.locator('#size-error').innerText()).trim() === '');

await page.locator('#variant-picker button', { hasText: /Get two costumes/ }).click();
await page.waitForURL('**/products/christmas-tree-costume/checkout', { timeout: 15000 });
{
	// The payment page is a page of its own. The link carried the choice and
	// `added=1` (the product page reported the add), and the page took them
	// out of the address bar once read: the buyer sees the plain address.
	const url = new URL(page.url());
	check('add to cart opens the costume’s payment page', url.pathname === '/products/christmas-tree-costume/checkout', page.url());
	check('at its plain address, with no choice in the link', url.search === '', url.search);
	// The Classic Christmas checkout (tests/classic-checkout.mjs drives it in
	// full): the choice arrives in its order panel's selects.
	check('the choice is in the order panel, to change there', (await page.inputValue('#order-design')) === 'green' && (await page.inputValue('#order-size')) === 'M');
	check('none of the product page comes across: no photos, no title, no bundle cards', (await page.locator('.gallery').count()) === 0 && !(await page.locator('h1', { hasText: 'Christmas Tree Costume' }).count()) && (await page.locator('label.tier').count()) === 0);
	// Google Analytics groups pages by title: the payment page needs its own.
	check('the payment page has a title of its own', /^Checkout · Christmas Tree Costume/.test(await page.title()), await page.title());
	check('its own chrome: logo and padlock, no menu', (await page.locator('.classic-head img[src="/brand/logo-white.png"]').count()) === 1 && !(await page.locator('header nav').count()));
}

{
	const lines = await cartLines();
	check(
		'the cart holds exactly the chosen colour and size',
		lines.length === 1 && lines[0].colour === 'green' && lines[0].size === 'M' && lines[0].quantity === 2,
		JSON.stringify(lines)
	);
}

// --- AddToCart --------------------------------------------------------------------
{
	const add = await pairedOnce('AddToCart');
	check('AddToCart names the variant by SKU', JSON.stringify(add.data.content_ids) === `["${SKU}"]`, JSON.stringify(add.data));
	check('AddToCart carries both costumes', add.data.value === '55.98' && add.data.num_items === 2, JSON.stringify(add.data));
	check('AddToCart server copy matches', JSON.stringify(add.server.content_ids) === `["${SKU}"]` && add.server.value === '55.98', JSON.stringify(add.server));
	const item = (await dataLayer()).find((e) => e.event === 'add_to_cart')?.ecommerce?.items?.[0];
	check('add_to_cart names the variant for GA4', item?.item_id === SKU && item?.item_variant === 'green / M' && item?.price === 27.99, JSON.stringify(item));
}

// --- the checkout line, priced by the server ---------------------------------------
await page.locator('button.classic-payb', { hasText: `$${PRICE}` }).waitFor({ timeout: 10000 }).catch(() => {});
{
	const summary = (await page.locator('.classic-order').textContent()) ?? '';
	check('checkout shows the product', summary.includes('Christmas Tree Costume'), summary.slice(0, 300));
	check('checkout shows the size’s weight band', /M · [\d.]+–[\d.]+ kg/.test(summary), summary.slice(0, 300));
	check('checkout charges $27.99', (await page.locator('button.classic-payb').innerText()).includes(`$${PRICE}`));
	check('one ViewContent for the visit: the product page’s', (await browserEvent('ViewContent')).length === 1);
	check('and one AddToCart', (await browserEvent('AddToCart')).length === 1);
}

// --- place the order --------------------------------------------------------------------
await page.fill('#contact-email', 'tree@example.com');
await page.fill('#shipping-firstName', 'Holly');
await page.fill('#shipping-lastName', 'Ivy');
await page.fill('#shipping-address', '1 Evergreen Terrace');
await page.fill('#shipping-city', 'Albany');
await page.selectOption('#shipping-state', 'NY');
await page.fill('#shipping-zip', '12207');
await page.locator('button.classic-payb').click();
await page
	.getByRole('heading', { name: /order received/i })
	.waitFor({ timeout: 20000 })
	.catch(() => {});
const body = (await page.textContent('body')) ?? '';
const orderNumber = /CMP-[0-9A-F]{8}/.exec(body)?.[0];
check('the order was accepted', Boolean(orderNumber), body.slice(0, 300));

// --- the order row carries colour and size ------------------------------------------
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
		'the order line is the chosen colour and size at the server price',
		rows.rows.length === 1 &&
			row.sku === SKU &&
			row.option1 === 'green' &&
			row.option2 === 'M' &&
			Number(row.unit_price_cents) === 2799 &&
			Number(row.quantity) === 2 &&
			row.product_slug === 'christmas-tree-costume',
		JSON.stringify(row)
	);
	db.close();
}

// --- Purchase -----------------------------------------------------------------------------
{
	const purchase = (await browserEvent('Purchase'))[0];
	check('Purchase fired', Boolean(purchase));
	check('Purchase names the SKU', JSON.stringify(purchase?.[2]?.content_ids) === `["${SKU}"]`, JSON.stringify(purchase?.[2]));
	check('Purchase carries the order-derived event id', purchase?.[3]?.eventID === `purchase-${orderNumber}`, JSON.stringify(purchase?.[3]));
	check('Purchase is never posted to /api/track', serverCopy('Purchase').length === 0);
}

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
