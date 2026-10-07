/**
 * Offline tests for functions/api/stripe-webhook.js. Signs payloads the way
 * Stripe does and stubs fetch, so nothing reaches Stripe or Meta.
 *
 *   npm run test:hoodie
 *
 * Kept outside functions/: every file in there becomes a route.
 */
import { createHash } from 'node:crypto';
import { signStripePayload } from '../../packages/ecomwithai/src/payments/signature.ts';
import { onRequestPost, PIXEL_ID } from './functions/api/stripe-webhook.js';

let failures = 0;

function check(label, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
	if (!ok) {
		console.log(`      expected ${JSON.stringify(expected)}`);
		console.log(`      actual   ${JSON.stringify(actual)}`);
		failures += 1;
	}
}

const sha = (v) => createHash('sha256').update(v).digest('hex');

const SECRET = 'whsec_test_hoodie';
const ENV = { STRIPE_WEBHOOK_SECRET: SECRET, META_CAPI_ACCESS_TOKEN: 'EAAtest' };

/** A session shaped like the ones plink_1ULu2aJOsB1nguzlIzkLcmZG creates. */
function session(overrides = {}) {
	return {
		id: 'cs_live_hoodie123',
		object: 'checkout.session',
		amount_total: 4900,
		currency: 'usd',
		payment_status: 'paid',
		payment_link: 'plink_1ULu2aJOsB1nguzlIzkLcmZG',
		metadata: { brand: 'ChillMyPet', slug: 'pouch-pet-hoodie', source: 'landing/pouch-pet-hoodie' },
		customer_details: {
			email: ' Buyer@Example.COM ',
			phone: '+420 733 000 111',
			name: 'Mary Ann Smith',
			address: { city: 'Praha', state: null, postal_code: '110 00', country: 'CZ' }
		},
		...overrides
	};
}

async function deliver(event, { env = ENV, signWith = SECRET, metaStatus = 200 } = {}) {
	const body = JSON.stringify(event);
	const header = await signStripePayload(signWith, body, Math.floor(Date.now() / 1000));
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url, body: JSON.parse(init.body) });
		return Response.json(metaStatus === 200 ? { events_received: 1 } : { error: { message: 'bad' } }, {
			status: metaStatus
		});
	};
	const request = new Request('https://chillmypet-hoodie.pages.dev/api/stripe-webhook', {
		method: 'POST',
		headers: { 'stripe-signature': header },
		body
	});
	const response = await onRequestPost({ request, env });
	return { status: response.status, json: await response.json(), calls };
}

const paid = { id: 'evt_1', type: 'checkout.session.completed', created: 1791000000, data: { object: session() } };

// --- a paid hoodie order is reported once, to the right dataset ---
{
	const { status, json, calls } = await deliver(paid);
	check('paid order answers 200', status, 200);
	check('paid order is handled', json, { handled: true, eventId: 'cs_live_hoodie123' });
	check('one request to Meta', calls.length, 1);
	check('posts to the ad account dataset', calls[0].url, `https://graph.facebook.com/v25.0/${PIXEL_ID}/events`);
	check('dataset is the live ad account', PIXEL_ID, '1341978141149107');

	const sent = calls[0].body.data[0];
	check('event is Purchase', sent.event_name, 'Purchase');
	check('event_id is the session id thank-you.html uses', sent.event_id, 'cs_live_hoodie123');
	check('event_time is when Stripe created the event', sent.event_time, 1791000000);
	check('action source is website', sent.action_source, 'website');
	check('source url is the thank-you page', sent.event_source_url, 'https://chillmypet-hoodie.pages.dev/thank-you.html');
	check('value is what Stripe charged', sent.custom_data.value, '49.00');
	check('currency is upper-case', sent.custom_data.currency, 'USD');
	check('content id matches the browser event', sent.custom_data.content_ids, ['pouch-pet-hoodie']);
	check('one unit', sent.custom_data.num_items, 1);
	check('email normalized then hashed', sent.user_data.em, [sha('buyer@example.com')]);
	check('phone digits only, hashed', sent.user_data.ph, [sha('420733000111')]);
	check('first name keeps every given name', sent.user_data.fn, [sha('maryann')]);
	check('last name is the final word', sent.user_data.ln, [sha('smith')]);
	check('city hashed', sent.user_data.ct, [sha('praha')]);
	check('zip without spaces, hashed', sent.user_data.zp, [sha('11000')]);
	check('country alpha-2, hashed', sent.user_data.country, [sha('cz')]);
	check('missing state is omitted, never null', 'st' in sent.user_data, false);
	check('token travels in the body', calls[0].body.access_token, 'EAAtest');
	check('no test code unless asked', 'test_event_code' in calls[0].body, false);
}

// --- what must NOT be reported ---
{
	const { status, json, calls } = await deliver(paid, { signWith: 'whsec_someone_else' });
	check('wrong signature is rejected', status, 400);
	check('wrong signature names the reason', json.reason, 'invalid_signature');
	check('wrong signature sends nothing', calls.length, 0);
}
{
	const event = { ...paid, data: { object: session({ payment_status: 'unpaid' }) } };
	const { status, json, calls } = await deliver(event);
	check('unpaid completion answers 200', status, 200);
	check('unpaid completion waits for the money', json.reason, 'awaiting_payment');
	check('unpaid completion sends nothing', calls.length, 0);
}
{
	const event = { ...paid, data: { object: session({ metadata: {} }) } };
	const { status, json, calls } = await deliver(event);
	check('a storefront session answers 200', status, 200);
	check('a storefront session is not the hoodie', json.reason, 'not_hoodie');
	check('a storefront session sends nothing', calls.length, 0);
}
{
	const event = { ...paid, type: 'charge.refunded' };
	const { status, json, calls } = await deliver(event);
	check('other event types answer 200', status, 200);
	check('other event types are ignored', json.reason, 'ignored');
	check('other event types send nothing', calls.length, 0);
}

// --- a delayed payment is reported when it settles ---
{
	const event = { ...paid, type: 'checkout.session.async_payment_succeeded', data: { object: session({ payment_status: 'paid' }) } };
	const { status, calls } = await deliver(event);
	check('settled delayed payment answers 200', status, 200);
	check('settled delayed payment is reported', calls.length, 1);
}

// --- failures make Stripe retry instead of losing the sale ---
{
	const { status, json, calls } = await deliver(paid, { env: { META_CAPI_ACCESS_TOKEN: 'EAAtest' } });
	check('no signing secret answers 503 so Stripe retries', status, 503);
	check('no signing secret says so', json.missing, 'STRIPE_WEBHOOK_SECRET');
	check('no signing secret sends nothing', calls.length, 0);
}
{
	const { status, json, calls } = await deliver(paid, { env: { STRIPE_WEBHOOK_SECRET: SECRET } });
	check('no Meta token answers 503 so Stripe retries', status, 503);
	check('no Meta token says so', json.reason, 'not_configured');
	check('no Meta token sends nothing', calls.length, 0);
}
{
	const { status, json } = await deliver(paid, { metaStatus: 400 });
	check('Meta rejecting the event answers 502 so Stripe retries', status, 502);
	check('Meta rejecting the event says so', json.reason, 'request_failed');
}
{
	const { calls } = await deliver(paid, { env: { ...ENV, META_TEST_EVENT_CODE: 'TEST123' } });
	check('test code is passed when set', calls[0].body.test_event_code, 'TEST123');
}

if (failures > 0) {
	console.log(`\n${failures} hoodie webhook check(s) failed.`);
	process.exit(1);
}
console.log('\nAll hoodie webhook checks passed.');
