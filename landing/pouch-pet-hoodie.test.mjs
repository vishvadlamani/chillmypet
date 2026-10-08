// Drives landing/pouch-pet-hoodie/_worker.js with Meta mocked out and Stripe
// events signed here.
// It lives beside the folder, not in it, because the folder is what gets
// published. Run: node landing/pouch-pet-hoodie.test.mjs
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import worker from './pouch-pet-hoodie/_worker.js';

const HOST = 'https://chillmypet-hoodie.pages.dev';
const SESSION = 'cs_live_a1B2c3';
const WHSEC = 'whsec_test';
const env = (extra = {}) => ({
	META_CAPI_ACCESS_TOKEN: 'tok',
	STRIPE_WEBHOOK_SECRET: WHSEC,
	ASSETS: { fetch: async () => new Response('static') },
	...extra
});

let calls;
let metaStatus = 200;
globalThis.fetch = async (url, init = {}) => {
	calls.push({ url: String(url), init });
	return Response.json({ events_received: 1 }, { status: metaStatus });
};
console.error = () => {};

async function hit(path, body, { env: e = env(), headers = {}, method = 'POST' } = {}) {
	calls = [];
	const waits = [];
	const res = await worker.fetch(
		new Request(HOST + path, {
			method,
			body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
			headers: {
				'CF-Connecting-IP': '203.0.113.7',
				'User-Agent': 'Mozilla/5.0 test',
				Cookie: '_fbp=fb.1.1700000000000.123; other=1',
				...headers
			}
		}),
		e,
		{ waitUntil: (p) => waits.push(p) }
	);
	await Promise.all(waits);
	const meta = calls.filter((c) => c.url.startsWith('https://graph.facebook.com/'));
	return { res, meta, events: meta.map((c) => JSON.parse(c.init.body)) };
}

let n = 0;
async function test(name, fn) {
	await fn();
	n++;
	console.log('ok', name);
}

await test('static files pass through to the assets', async () => {
	const { res, meta } = await hit('/index.html', null, { method: 'GET' });
	assert.equal(await res.text(), 'static');
	assert.equal(meta.length, 0);
});

await test('a browser event gets a server copy with the same id', async () => {
	const { res, meta, events } = await hit('/api/event', {
		name: 'InitiateCheckout',
		id: 'abc-123-def-456',
		url: HOST + '/?fbclid=CLICK1',
		data: { value: 49, currency: 'USD', num_items: 1, content_ids: ['x'] }
	});
	assert.equal(res.status, 204);
	assert.equal(meta.length, 1);
	assert.match(meta[0].url, /\/v25\.0\/1341978141149107\/events\?access_token=tok$/);
	const e = events[0].data[0];
	assert.equal(e.event_name, 'InitiateCheckout');
	assert.equal(e.event_id, 'abc-123-def-456');
	assert.equal(e.action_source, 'website');
	assert.equal(e.event_source_url, HOST + '/?fbclid=CLICK1');
	assert.deepEqual(e.custom_data, { content_ids: ['pouch-pet-hoodie'], value: 49, currency: 'USD', num_items: 1 });
	assert.equal(e.user_data.client_ip_address, '203.0.113.7');
	assert.equal(e.user_data.client_user_agent, 'Mozilla/5.0 test');
	assert.equal(e.user_data.fbp, 'fb.1.1700000000000.123');
	assert.match(e.user_data.fbc, /^fb\.1\.\d+\.CLICK1$/);
});

await test('the pixel-written _fbc cookie wins over one built from the URL', async () => {
	const { events } = await hit(
		'/api/event',
		{ name: 'PageView', id: 'abc-123-def-456', url: HOST + '/?fbclid=NEW' },
		{ headers: { Cookie: '_fbc=fb.1.1690000000000.OLD' } }
	);
	assert.equal(events[0].data[0].user_data.fbc, 'fb.1.1690000000000.OLD');
});

await test('sendBeacon text/plain bodies are read', async () => {
	const { meta } = await hit('/api/event', JSON.stringify({ name: 'ViewContent', id: 'abc-123-def-456', url: HOST + '/' }), {
		headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
	});
	assert.equal(meta.length, 1);
});

await test('the public endpoint cannot claim a Purchase', async () => {
	const { res, meta } = await hit('/api/event', { name: 'Purchase', id: 'abc-123-def-456', url: HOST + '/' });
	assert.equal(res.status, 204);
	assert.equal(meta.length, 0);
});

await test('events for another site, bad ids and junk are dropped', async () => {
	assert.equal((await hit('/api/event', { name: 'PageView', id: 'abc-123-def-456', url: 'https://evil.example/' })).meta.length, 0);
	assert.equal((await hit('/api/event', { name: 'PageView', id: 'x', url: HOST + '/' })).meta.length, 0);
	assert.equal((await hit('/api/event', 'not json')).res.status, 400);
	assert.equal((await hit('/api/event', null, { method: 'GET' })).res.status, 405);
});

await test('no token, nothing sent and the page still gets 204', async () => {
	const { res, meta } = await hit('/api/event', { name: 'PageView', id: 'abc-123-def-456', url: HOST + '/' }, { env: env({ META_CAPI_ACCESS_TOKEN: undefined }) });
	assert.equal(res.status, 204);
	assert.equal(meta.length, 0);
});

const paid = {
	id: SESSION,
	object: 'checkout.session',
	status: 'complete',
	payment_status: 'paid',
	payment_link: 'plink_1ULu2aJOsB1nguzlIzkLcmZG',
	metadata: { slug: 'pouch-pet-hoodie' },
	client_reference_id: 'pink',
	amount_total: 4900,
	currency: 'usd',
	customer_details: {
		email: ' Jane@Example.com ',
		phone: '+1 (555) 010-2000',
		name: 'Jane Q. Doe',
		address: { country: 'US', postal_code: '94107-1234', city: null, state: null }
	},
	collected_information: {
		shipping_details: { name: 'Gift Person', address: { city: 'San Francisco', state: 'CA', postal_code: '94107', country: 'US' } }
	}
};
const SOLD_AT = 1760000000;
const stripeEvent = (session = paid, type = 'checkout.session.completed') => JSON.stringify({ id: 'evt_1', type, created: SOLD_AT, data: { object: session } });

// Signs a body the way Stripe does: HMAC-SHA256 of "<t>.<body>".
function signed(body, { secret = WHSEC, t = Math.floor(Date.now() / 1000) } = {}) {
	const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
	return { headers: { 'Stripe-Signature': `t=${t},v1=${v1}`, 'Content-Type': 'application/json' } };
}
async function webhook(body, opts = {}) {
	const r = await hit('/api/stripe-webhook', body, { ...signed(body, opts), ...opts });
	return { ...r, json: await r.res.json() };
}

await test('a paid hoodie session from Stripe is reported as Purchase, deduped on the session id', async () => {
	const { res, json, meta, events } = await webhook(stripeEvent());
	assert.equal(res.status, 200);
	assert.deepEqual(json, { handled: true, eventId: SESSION });
	assert.equal(meta.length, 1);
	assert.match(meta[0].url, /\/v25\.0\/1341978141149107\/events\?access_token=tok$/);
	const e = events[0].data[0];
	assert.equal(e.event_name, 'Purchase');
	assert.equal(e.event_id, SESSION);
	// When the sale happened, so a retry days later still lands on the right day.
	assert.equal(e.event_time, SOLD_AT);
	assert.equal(e.event_source_url, HOST + '/thank-you');
	assert.equal(e.action_source, 'website');
	assert.deepEqual(e.custom_data, { value: 49, currency: 'USD', content_ids: ['pouch-pet-hoodie'], content_type: 'product', num_items: 1, order_id: SESSION });
	const h = (v) => [createHash('sha256').update(v).digest('hex')];
	assert.deepEqual(e.user_data.em, h('jane@example.com'));
	assert.deepEqual(e.user_data.ph, h('15550102000'));
	// The buyer's name, not the gift recipient's.
	assert.deepEqual(e.user_data.fn, h('jane'));
	assert.deepEqual(e.user_data.ln, h('doe'));
	// Billing gave only country and zip; city and state come from shipping.
	assert.deepEqual(e.user_data.ct, h('sanfrancisco'));
	assert.deepEqual(e.user_data.st, h('ca'));
	assert.deepEqual(e.user_data.zp, h('94107'));
	assert.deepEqual(e.user_data.country, h('us'));
	// Stripe made the request, not the buyer: none of its IP or cookies.
	assert.equal(e.user_data.client_ip_address, undefined);
	assert.equal(e.user_data.fbp, undefined);
});

await test('a delayed payment is reported when it settles, not when it completes', async () => {
	const pending = { ...paid, payment_status: 'unpaid' };
	assert.equal((await webhook(stripeEvent(pending))).meta.length, 0);
	const { json, meta } = await webhook(stripeEvent({ ...paid, payment_status: 'paid' }, 'checkout.session.async_payment_succeeded'));
	assert.equal(json.handled, true);
	assert.equal(meta.length, 1);
});

await test("other events and the storefront's own sessions are acknowledged and ignored", async () => {
	for (const [body, reason] of [
		[stripeEvent(paid, 'charge.refunded'), 'ignored'],
		[stripeEvent({ ...paid, metadata: {}, payment_link: null }), 'not_hoodie'],
		[stripeEvent({ ...paid, metadata: { order_id: 'cmp_1' }, payment_link: 'plink_other' }), 'not_hoodie']
	]) {
		const { res, json, meta } = await webhook(body);
		assert.equal(res.status, 200);
		assert.equal(json.reason, reason);
		assert.equal(meta.length, 0);
	}
});

await test('a session from this link counts even without the metadata', async () => {
	assert.equal((await webhook(stripeEvent({ ...paid, metadata: {} }))).meta.length, 1);
});

await test('a forged, stale or missing signature is refused before anything is sent', async () => {
	const body = stripeEvent();
	for (const opts of [{ secret: 'whsec_wrong' }, { t: Math.floor(Date.now() / 1000) - 3600 }]) {
		const { res, meta } = await webhook(body, opts);
		assert.equal(res.status, 400);
		assert.equal(meta.length, 0);
	}
	const { res } = await hit('/api/stripe-webhook', body);
	assert.equal(res.status, 400);
	assert.equal((await hit('/api/stripe-webhook', null, { method: 'GET' })).res.status, 405);
});

await test('a rolled secret: any one valid v1 passes', async () => {
	const body = stripeEvent();
	const t = Math.floor(Date.now() / 1000);
	const good = createHmac('sha256', WHSEC).update(`${t}.${body}`).digest('hex');
	const { res } = await hit('/api/stripe-webhook', body, { headers: { 'Stripe-Signature': `t=${t},v1=${'0'.repeat(64)},v1=${good}` } });
	assert.equal(res.status, 200);
});

await test('missing secrets or a Meta rejection fail the delivery, so Stripe retries', async () => {
	const body = stripeEvent();
	assert.equal((await webhook(body, { env: env({ STRIPE_WEBHOOK_SECRET: undefined }) })).res.status, 503);
	assert.equal((await webhook(body, { env: env({ META_CAPI_ACCESS_TOKEN: undefined }) })).res.status, 503);
	metaStatus = 400;
	try {
		assert.equal((await webhook(body)).res.status, 502);
	} finally {
		metaStatus = 200;
	}
});

await test('the old /api/purchase route is gone', async () => {
	const { res, meta } = await hit('/api/purchase', { session_id: SESSION });
	assert.equal(await res.text(), 'static');
	assert.equal(meta.length, 0);
});

await test('no functions/ folder: Pages ignores it while _worker.js exists', async () => {
	assert.equal(existsSync(new URL('./pouch-pet-hoodie/functions', import.meta.url)), false);
});

await test('META_TEST_EVENT_CODE routes to Test Events', async () => {
	const { events } = await hit('/api/event', { name: 'PageView', id: 'abc-123-def-456', url: HOST + '/' }, { env: env({ META_TEST_EVENT_CODE: 'TEST1' }) });
	assert.equal(events[0].test_event_code, 'TEST1');
});

console.log(`\n${n} passed`);
