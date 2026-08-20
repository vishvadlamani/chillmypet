/**
 * The block-rendered storefront, end to end in a real browser.
 *
 * Covers the seams the blocks deliberately leave to the host: turning
 * "add_to_cart" into cart lines and a destination, reading what the forms wrote
 * into host state, checking across all three of them, and posting an order the
 * server accepts. None of that is visible to a type check — the blocks compile
 * and render perfectly with every one of those wires cut.
 *
 *   node tests/store-flow.mjs
 *
 * Expects a dev server with no STRIPE_SECRET_KEY, so the order confirms on the
 * page instead of redirecting to Stripe. Payment itself is covered by
 * tests/payment-flow.mjs.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
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
	if (text.includes('ERR_FAILED') || text.includes('net::')) return;
	pageErrors.push(`console: ${text}`);
});

const fbqCalls = () => page.evaluate(() => (window.fbq?.queue ?? []).map((a) => Array.from(a)));
const tracked = (calls, event) => calls.find((c) => c[0] === 'track' && c[1] === event);
const money = (text) => Number(/\$([\d,]+\.\d{2})/.exec(text ?? '')?.[1]?.replace(',', '') ?? NaN);

function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) process.exitCode = 1;
}

// --- product page: a block states intent, the host routes it ---------------
await page.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /buy now/i }).first().click();
await page.waitForURL('**/store/checkout**', { timeout: 15000 });
check('buy now lands on the checkout', page.url().includes('/store/checkout'));

const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'));
check('the selection became real cart lines', stored.length > 0 && stored[0].variantId > 0,
	JSON.stringify(stored));

// --- the summary prices what the server will charge ------------------------
await page.waitForSelector('dl');
const summary = await page.locator('form dl').innerText();
const subtotal = money(summary.split('\n').slice(0, 2).join(' '));
check('the summary prices the cart', subtotal > 0, summary);

const payButton = page.getByRole('button', { name: /^(Pay |Place order)/ });
check('the button offers a total, not just a verb', /Pay \$/.test(await payButton.innerText()));

// --- the cross-form check --------------------------------------------------
// Each block validates only its own fields and none of them has a button, so
// an empty checkout would post happily without this.
await payButton.click();
await page.waitForSelector('form [role="alert"]');
const issues = await page.locator('form [role="alert"]').last().innerText();
check('an empty checkout does not post', page.url().includes('/store/checkout'));
check('it says the name is missing', /Full name is required/i.test(issues), issues);
check('it says the email is missing', /Email is required/i.test(issues), issues);
check('it says the address is missing', /Address is required/i.test(issues), issues);

// --- fill it in ------------------------------------------------------------
await page.fill('#contact-fullName', 'Block Buyer');
await page.fill('#contact-email', 'blocks@example.com');

// One search field that expands into six. Without a Places key, dev serves a
// fixture — the point being that an autocompleted address has to arrive in host
// state in the shape the order takes.
await page.fill('#shipping-lookup', '751');
await page.waitForSelector('[role="option"]');
await page.locator('[role="option"]').first().click();
await page.waitForSelector('#shipping-city');

check('the chosen address filled the city', (await page.inputValue('#shipping-city')) === 'Delta');
check(
	'the province arrived as a code, not a display name',
	(await page.inputValue('#shipping-state')) === 'BC',
	await page.inputValue('#shipping-state')
);
check('the country came through', (await page.inputValue('#shipping-country')) === 'Canada');

// --- shipping method moves the total ---------------------------------------
// The method block writes its choice into host state; nothing else connects it
// to the money. If the summary and the button don't follow, the seam is dead.
const totalNow = async () =>
	money((await page.locator('form dl').innerText()).split('\n').at(-1));

const beforeExpress = await totalNow();
const beforeLabel = (await payButton.innerText()).trim();
await page.check('input[name="method-method"][value="express"]');
await page.waitForFunction(
	(was) => document.querySelector('form button[type="submit"]')?.textContent?.trim() !== was,
	beforeLabel
);
const afterExpress = await totalNow();
check(
	'choosing express repriced the order',
	afterExpress === beforeExpress + 12,
	`${beforeExpress} → ${afterExpress}`
);
check('and the button followed it', (await payButton.innerText()).includes(afterExpress.toFixed(2)));

// --- place it --------------------------------------------------------------
await payButton.click();
// The checkout's own <h1> says "Checkout", so waiting for a heading proves
// nothing — wait for the confirmation to replace it.
await page
	.getByRole('heading', { name: /order received/i })
	.waitFor({ timeout: 20000 })
	.catch(() => {});
const heading = await page.textContent('h1');
check(
	'the order was accepted',
	/Order received/i.test(heading ?? ''),
	`${heading} — ${(await page.locator('[role="alert"]').allInnerTexts()).join(' / ')}`
);
// "Canada" is not an ISO code — had the host not mapped it, the order would
// have come back a 400 rather than a confirmation.
const body = await page.textContent('body');
check('an order number came back', /CMP-[0-9A-F]{8}/.test(body ?? ''), /CMP-\S+/.exec(body ?? '')?.[0]);

const calls = await fbqCalls();
const purchase = tracked(calls, 'Purchase');
check('Purchase fired', Boolean(purchase));
check('Purchase is worth what was charged', purchase?.[2]?.value === afterExpress.toFixed(2),
	JSON.stringify(purchase?.[2]));
check('Purchase carries an eventID for CAPI dedup', /^purchase-CMP-/.test(purchase?.[3]?.eventID ?? ''));
check('the cart was emptied', (await page.evaluate(() =>
	JSON.parse(localStorage.getItem('chillmypet.cart.v1') ?? '[]'))).length === 0);

if (pageErrors.length) {
	console.log('\nPage errors:');
	for (const e of pageErrors) console.log(`  ${e}`);
	process.exitCode = 1;
} else {
	console.log('\nNo page errors.');
}

await browser.close();
