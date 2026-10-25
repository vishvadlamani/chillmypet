import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5195';
const auth = `Basic ${Buffer.from(`owner:${process.env.ADMIN_PASSWORD ?? 'test-admin'}`).toString('base64')}`;
const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret';
const seen = [], events = [];
const id = `pi_sandbox_${Date.now()}`;
const mock = (port, handler) => {
	const server = createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += chunk;
		const result = handler(req, body);
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(result));
	});
	return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
};
const stripe = await mock(12111, (req, body) => {
	if (req.method === 'POST') seen.push(new URLSearchParams(body));
	return { id, client_secret: `${id}_secret_mock`, amount: 100, amount_received: 0, currency: 'usd', status: 'requires_payment_method' };
});
const meta = await mock(12112, (_, body) => {
	events.push(JSON.parse(body));
	return { events_received: 1, messages: [] };
});
let browser;
try {
	assert.equal((await fetch(`${BASE}/admin/payment-test`)).status, 401);
	assert.equal((await fetch(`${BASE}/checkout`)).status, 401);
	const response = await fetch(`${BASE}/admin/payment-test`, { headers: { authorization: auth } });
	assert.equal(response.status, 200);
	assert.match(response.headers.get('cache-control'), /no-store/);
	const html = await response.text();
	assert.ok(!html.includes('connect.facebook.net'));
	assert.ok(!html.includes('googletagmanager.com/gtm.js'));

	browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
	const context = await browser.newContext({ httpCredentials: { username: 'owner', password: process.env.ADMIN_PASSWORD ?? 'test-admin' } });
	// The test uses server-side Stripe mocks; it never loads the external card form.
	await context.route('https://js.stripe.com/**', route => route.abort());
	const page = await context.newPage();
	page.on('pageerror', error => console.error('Browser error:', error.message));
	await page.goto(`${BASE}/admin/payment-test`);
	await page.getByRole('button', { name: 'Start $1.00 test', exact: true }).click();
	await page.waitForURL(`${BASE}/checkout`);
	await page.getByText('SANDBOX · $1.00 test · No real charge or shipment', { exact: true }).waitFor();
	const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('chillmypet.cart.v1')));
	assert.equal(cart.length, 1);
	assert.equal(cart[0].quantity, 1);
	assert.equal(cart[0].unitPriceCents, 100);
	assert.match(await page.locator('body').innerText(), /\$1\.00/);
	assert.equal(await page.getByRole('button', { name: /increase quantity|decrease quantity/i }).count(), 0);
	console.log('PASS protected button opens the shared checkout with exactly one $1 item and sandbox banner');

	const form = new URLSearchParams({
		email: 'sandbox@example.com', firstName: 'Sandbox', lastName: 'Buyer',
		address1: '1 Test Street', city: 'San Francisco', province: 'CA', postalCode: '94103', country: 'US',
		method: 'express', cardReady: '1', submissionId: randomUUID(),
		lines: JSON.stringify([{ variantId: cart[0].variantId, quantity: 1, unitPriceCents: 0 }])
	});
	const place = body => fetch(`${BASE}/checkout`, {
		method: 'POST', redirect: 'manual',
		headers: { authorization: auth, origin: BASE, accept: 'application/json', 'user-agent': 'Mozilla/5.0 SandboxTest', 'content-type': 'application/x-www-form-urlencoded' }, body
	});
	const invalid = new URLSearchParams(form);
	invalid.set('lines', JSON.stringify([{ variantId: cart[0].variantId, quantity: 2 }]));
	assert.equal((await (await place(invalid)).json()).status, 400);
	assert.equal(seen.length, 0);
	invalid.set('lines', JSON.stringify([{ variantId: 999999999, quantity: 1 }]));
	assert.equal((await (await place(invalid)).json()).status, 400);
	assert.equal((await place(form)).status, 200);
	assert.equal(seen.length, 1);
	const params = seen[0];
	assert.equal(params.get('amount'), '100');
	assert.equal(params.get('currency'), 'usd');
	assert.equal(params.get('metadata[store_id]'), 'chillmypet-payment-test');
	const orderNumber = params.get('metadata[order_number]');
	assert.match(orderNumber, /^SANDBOX-/);
	console.log('PASS server rejects extra quantity and other items; ignores forged prices and charges exactly 100 cents');

	const metadata = Object.fromEntries([...params].filter(([key]) => /^metadata\[/.test(key)).map(([key, value]) => [key.slice(9, -1), value]));
	const body = JSON.stringify({ id: `evt_${randomUUID()}`, livemode: false, type: 'payment_intent.succeeded', data: { object: { id, amount_received: 100, currency: 'usd', metadata } } });
	const ts = Math.floor(Date.now() / 1000);
	const signature = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
	const hook = signatureValue => fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signatureValue }, body });
	assert.equal((await hook('t=1,v1=bad')).status, 400);
	const paid = await hook(`t=${ts},v1=${signature}`);
	assert.equal(paid.status, 200);
	assert.equal((await paid.json()).action, 'order_paid');
	for (let i = 0; i < 25 && !events.some(e => e.data?.some(d => d.event_name === 'Purchase')); i++) await new Promise(r => setTimeout(r, 100));
	await hook(`t=${ts},v1=${signature}`);
	const purchases = events.flatMap(e => e.data?.filter(d => d.event_name === 'Purchase').map(d => ({ ...d, test_event_code: e.test_event_code })) ?? []);
	assert.equal(purchases.length, 1);
	assert.equal(purchases[0].test_event_code, 'TEST_SANDBOX');
	assert.equal(purchases[0].event_id, `purchase-${orderNumber}`);
	assert.equal(Number(purchases[0].custom_data.value), 1);
	assert.equal(purchases[0].custom_data.currency, 'USD');
	const receipt = await fetch(`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`, { headers: { authorization: auth } });
	assert.match(await receipt.text(), /Payment received/i);
	console.log('PASS signed payment confirmation marks the test order paid and reports exactly one $1 Purchase with Meta test code');
} finally {
	await browser?.close();
	await Promise.all([stripe, meta].map(server => new Promise(resolve => server.close(resolve))));
}
