/**
 * Abandoned-checkout reminder, end to end: a shopper types their email at
 * checkout and leaves; an hour later one reminder goes out; its link puts the
 * cart back with the email filled in; its unsubscribe page stops the next one.
 *
 *   node tests/checkout-recovery.mjs
 *
 * Expects a dev server with RESEND_API_KEY set to anything and
 * EMAIL_API_ENDPOINT=http://127.0.0.1:12113, and no STRIPE_SECRET_KEY. "An hour
 * later" is the test moving the draft's clock back in the database, which is why
 * it needs the same TURSO_DATABASE_URL (default file:local.db) as the server.
 */
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const EMAIL_PORT = Number(process.env.EMAIL_MOCK_PORT ?? 12113);
const RUN = Date.now().toString(36);
const ADDRESS = `left-${RUN}@example.com`;

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

// --- mock email provider -------------------------------------------------
const emails = [];
const mailer = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		try {
			emails.push({ ...JSON.parse(body), request: req.headers });
		} catch {
			emails.push({ request: req.headers, unparsed: body });
		}
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ id: `em_${emails.length}` }));
	});
});
await new Promise((resolve) => mailer.listen(EMAIL_PORT, '127.0.0.1', resolve));
const remindersTo = (to) => emails.filter((e) => e.to?.[0] === to && e.request['idempotency-key']?.startsWith('checkout-reminder/'));

const db = createClient({ url: process.env.TURSO_DATABASE_URL ?? 'file:local.db', authToken: process.env.TURSO_AUTH_TOKEN });
const draftRow = async () =>
	(await db.execute({ sql: 'select token, email, first_name, lines, reminded_at from checkout_drafts where email = ?', args: [ADDRESS] })).rows[0];
const leftAnHourAgo = () =>
	db.execute({
		sql: "update checkout_drafts set created_at = datetime('now', '-70 minutes'), updated_at = datetime('now', '-70 minutes') where email = ?",
		args: [ADDRESS]
	});
// The sweep endpoint pauses for a minute between runs, per isolate.
const sweep = async () => {
	for (let attempt = 0; attempt < 15; attempt++) {
		const result = await (await fetch(`${BASE}/api/recovery/sweep`, { method: 'POST' })).json();
		if (result.skipped !== 'throttled') return result;
		await new Promise((r) => setTimeout(r, 5000));
	}
	return { skipped: 'throttled' };
};
const until = async (fn, ms = 8000) => {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const value = await fn();
		if (value) return value;
		await new Promise((r) => setTimeout(r, 250));
	}
	return fn();
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const newShopper = async () => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	for (const pattern of ['**/connect.facebook.net/**', '**/facebook.com/tr*', '**/google.com/g/collect*', '**/google-analytics.com/**', '**/googletagmanager.com/**'])
		await ctx.route(pattern, (route) => route.abort());
	return ctx;
};

// --- the shopper who leaves ----------------------------------------------------
{
	const ctx = await newShopper();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/products/christmas-tree-costume`, { waitUntil: 'networkidle' });
	// No colour chosen: the page opens on green (`leadDesign`), and that is
	// what goes in the cart.
	await page.locator('#size-picker label').filter({ hasText: /^\s*M\s*$/ }).click();
	await page.locator('#variant-picker button', { hasText: /Add to cart/ }).click();
	// The costume's own payment page (`checkout: 'shop'` in pages.ts).
	await page.waitForURL('**/products/christmas-tree-costume/checkout', { timeout: 15000 });
	await page.waitForSelector('button.classic-payb');

	const hint = await page.textContent('body');
	check('the email field says a reminder may follow', /we'll send one reminder/i.test(hint ?? ''));

	await page.fill('#shipping-firstName', 'Holly');
	await page.fill('#shipping-lastName', 'Ivy');
	await page.fill('#contact-email', ADDRESS.slice(0, 6));
	await page.waitForTimeout(2500);
	check('a half-typed email saves nothing', !(await draftRow()));

	await page.fill('#contact-email', ADDRESS);
	const row = await until(draftRow);
	check('a valid email saves a draft once they stop typing', Boolean(row), 'no checkout_drafts row');
	check('the draft carries their first name', row?.first_name === 'Holly', row?.first_name);
	check('and the cart, as ids and quantities', JSON.parse(String(row?.lines ?? '[]')).length === 1 && JSON.parse(String(row?.lines))[0].quantity === 1, String(row?.lines));
	await ctx.close();
}

// --- an hour later -------------------------------------------------------------
check('nothing is sent while they might still be shopping', (await sweep(), remindersTo(ADDRESS).length === 0));
await leftAnHourAgo();
const result = await sweep();
check('the sweep reports one reminder sent', result.sent >= 1, JSON.stringify(result));
const reminder = await until(() => remindersTo(ADDRESS)[0]);
check('one reminder reaches the address', remindersTo(ADDRESS).length === 1, String(remindersTo(ADDRESS).length));
check('it names the costume in the subject', /Christmas Tree Costume is still in your cart/.test(reminder?.subject ?? ''), reminder?.subject);
check('it greets them by name', reminder?.text?.startsWith('Hi Holly,'), reminder?.text?.slice(0, 40));
check('it shows the line, with colour and size', /1 × Christmas Tree Costume — Green — M/.test(reminder?.text ?? ''), reminder?.text);
check('it shows the product photo', /<img src="http:\/\/127\.0\.0\.1:5173\/products\/dog-christmas-costume\//.test(reminder?.html ?? '') || /<img src="http/.test(reminder?.html ?? ''));
check('it carries a List-Unsubscribe header', /\/email\/unsubscribe\/[0-9a-f]{48}>$/.test(reminder?.headers?.['List-Unsubscribe'] ?? ''), JSON.stringify(reminder?.headers));
check('the draft is marked reminded', Boolean((await draftRow())?.reminded_at));

await sweep();
check('a second sweep sends nothing more', remindersTo(ADDRESS).length === 1, String(remindersTo(ADDRESS).length));

// --- the link puts the cart back -------------------------------------------------
const restoreUrl = /Finish your order: (\S+)/.exec(reminder?.text ?? '')?.[1];
check('the reminder links to a restore page', Boolean(restoreUrl?.includes('/checkout/restore/')), restoreUrl);
{
	const ctx = await newShopper(); // a different browser: nothing left in its storage
	const page = await ctx.newPage();
	await page.goto(restoreUrl, { waitUntil: 'networkidle' });
	await page.waitForURL('**/checkout', { timeout: 15000 });
	await page.waitForSelector('.classic-totals');
	const summary = await page.locator('.classic-order').innerText();
	check('it lands on the checkout', new URL(page.url()).pathname === '/checkout');
	check('with the costume back in the cart', summary.includes('Christmas Tree Costume') && /Green · M/.test(summary), summary.slice(0, 200));
	check('priced by the server', (await page.locator('.classic-totals').innerText()).includes('$27.99'));
	check('and their email already filled in', (await page.inputValue('#contact-email')) === ADDRESS, await page.inputValue('#contact-email'));
	await ctx.close();
}
{
	const ctx = await newShopper();
	const page = await ctx.newPage();
	await page.goto(`${BASE}/checkout/restore/${'0'.repeat(48)}`, { waitUntil: 'networkidle' });
	check('an unknown link says it expired and stays put', /expired/i.test((await page.textContent('body')) ?? '') && page.url().includes('/restore/'));
	await ctx.close();
}

// --- unsubscribing -----------------------------------------------------------------
const unsubscribeUrl = /Unsubscribe: (\S+)/.exec(reminder?.text ?? '')?.[1];
{
	const ctx = await newShopper();
	const page = await ctx.newPage();
	await page.goto(unsubscribeUrl, { waitUntil: 'networkidle' });
	const token = unsubscribeUrl.split('/').pop();
	const suppressed = async () =>
		(await db.execute({ sql: 'select 1 from email_suppressions where email = ?', args: [ADDRESS] })).rows.length > 0;
	check('opening the unsubscribe link alone changes nothing', !(await suppressed()));
	await page.getByRole('button', { name: 'Unsubscribe' }).click();
	await page.getByRole('status').waitFor({ timeout: 5000 });
	check('pressing the button confirms', /won't get any more reminders/.test(await page.getByRole('status').innerText()));
	check('and suppresses the address', await suppressed());
	check('the token was the one in the email', token === (await draftRow())?.token);
	await ctx.close();
}

// A new abandoned cart from the same address after opting out: never reminded.
await db.execute({ sql: "update checkout_drafts set reminded_at = datetime('now', '-40 days') where email = ?", args: [ADDRESS] });
await leftAnHourAgo();
await sweep();
check('after unsubscribing, no further reminder is sent', remindersTo(ADDRESS).length === 1, String(remindersTo(ADDRESS).length));

await browser.close();
mailer.close();
db.close();
console.log(failures ? `\n${failures} recovery check(s) failed.` : '\nCheckout recovery works end to end.');
process.exit(failures ? 1 : 0);
