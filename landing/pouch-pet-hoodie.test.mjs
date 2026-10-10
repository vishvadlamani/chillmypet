// Drives landing/pouch-pet-hoodie/_worker.js with Meta and Stripe mocked out.
// It lives beside the folder, not in it, because the folder is what gets
// published. Run: node landing/pouch-pet-hoodie.test.mjs
import assert from 'node:assert/strict';
import worker from './pouch-pet-hoodie/_worker.js';

const HOST = 'https://chillmypet-hoodie.pages.dev';
const SESSION = 'cs_live_a1B2c3';
const env = (extra = {}) => ({
	META_CAPI_ACCESS_TOKEN: 'tok',
	STRIPE_SECRET_KEY: 'rk_live_x',
	ASSETS: { fetch: async () => new Response('static') },
	...extra
});

let calls;
let stripeSession;
globalThis.fetch = async (url, init = {}) => {
	calls.push({ url: String(url), init });
	if (String(url).startsWith('https://api.stripe.com/')) {
		return stripeSession ? Response.json(stripeSession) : new Response('{}', { status: 404 });
	}
	return Response.json({ events_received: 1 });
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
	status: 'complete',
	payment_status: 'paid',
	payment_link: 'plink_1ULu2aJOsB1nguzlIzkLcmZG',
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

await test('a paid session is reported as Purchase, deduped on the session id', async () => {
	stripeSession = paid;
	const { meta, events } = await hit('/api/purchase', { session_id: SESSION, url: HOST + '/thank-you?session_id=' + SESSION });
	const stripe = calls.find((c) => c.url.startsWith('https://api.stripe.com/'));
	assert.equal(stripe.url, 'https://api.stripe.com/v1/checkout/sessions/' + SESSION);
	assert.equal(stripe.init.headers.Authorization, 'Bearer rk_live_x');
	assert.equal(meta.length, 1);
	const e = events[0].data[0];
	assert.equal(e.event_name, 'Purchase');
	assert.equal(e.event_id, SESSION);
	assert.deepEqual(e.custom_data, { value: 49, currency: 'USD', content_ids: ['pouch-pet-hoodie'], content_type: 'product', num_items: 1, order_id: SESSION });
	const { createHash } = await import('node:crypto');
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
	assert.equal(e.user_data.fbp, 'fb.1.1700000000000.123');
	assert.equal(e.user_data.client_ip_address, '203.0.113.7');
});

await test('unpaid, unfinished or other-link sessions are not sales', async () => {
	for (const s of [
		{ ...paid, payment_status: 'unpaid' },
		{ ...paid, status: 'open' },
		{ ...paid, payment_link: 'plink_other' },
		null
	]) {
		stripeSession = s;
		assert.equal((await hit('/api/purchase', { session_id: SESSION })).meta.length, 0);
	}
});

await test('a malformed session id never reaches Stripe', async () => {
	stripeSession = paid;
	const { meta } = await hit('/api/purchase', { session_id: '../../v1/charges' });
	assert.equal(calls.length, 0);
	assert.equal(meta.length, 0);
});

await test('no Stripe key, no Purchase', async () => {
	stripeSession = paid;
	const { meta } = await hit('/api/purchase', { session_id: SESSION }, { env: env({ STRIPE_SECRET_KEY: undefined }) });
	assert.equal(meta.length, 0);
});

await test('META_TEST_EVENT_CODE routes to Test Events', async () => {
	const { events } = await hit('/api/event', { name: 'PageView', id: 'abc-123-def-456', url: HOST + '/' }, { env: env({ META_TEST_EVENT_CODE: 'TEST1' }) });
	assert.equal(events[0].test_event_code, 'TEST1');
});

console.log(`\n${n} passed`);
