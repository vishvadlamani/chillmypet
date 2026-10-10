/**
 * The Christmas hoodie page's worker, offline: Meta is a stub and Stripe's
 * events are signed here with a test secret.
 *
 *   node landing/christmas-pouch-hoodie.test.mjs
 */
import { createHmac } from 'node:crypto';
import worker from './christmas-pouch-hoodie/_worker.js';

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

const sent = [];
globalThis.fetch = async (url, init) => {
	sent.push({ url: String(url), body: JSON.parse(init.body) });
	return new Response('{"events_received":1}', { status: 200 });
};

const SECRET = 'whsec_test';
const env = {
	META_CAPI_ACCESS_TOKEN: 'token',
	STRIPE_WEBHOOK_SECRET: SECRET,
	ASSETS: { fetch: async () => new Response('page') }
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const ORIGIN = 'https://chillmypet-christmas.pages.dev';

function signed(event) {
	const raw = JSON.stringify(event);
	const t = Math.floor(Date.now() / 1000);
	const v1 = createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex');
	return new Request(`${ORIGIN}/api/stripe-webhook`, {
		method: 'POST',
		headers: { 'Stripe-Signature': `t=${t},v1=${v1}` },
		body: raw
	});
}
const session = (metadata, extra = {}) => ({
	id: 'evt_1',
	type: 'checkout.session.completed',
	created: 1790000000,
	data: {
		object: {
			id: 'cs_live_abc',
			payment_status: 'paid',
			amount_total: 5499,
			currency: 'usd',
			metadata,
			customer_details: { email: 'Holly@Example.com', name: 'Holly Ivy', address: { country: 'US', postal_code: '94107', city: 'San Francisco', state: 'CA' } },
			...extra
		}
	}
});

// --- a Christmas sale ----------------------------------------------------------
{
	sent.length = 0;
	const res = await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-STOCKING-GREEN-L' })), env, ctx);
	const body = await res.json();
	const e = sent[0]?.body.data[0];
	check('a paid Christmas session is reported', res.status === 200 && body.handled === true, JSON.stringify(body));
	check('to dataset 1341978141149107', sent[0]?.url.includes('/1341978141149107/events'));
	check('as Purchase under the session id the thank-you page uses', e?.event_name === 'Purchase' && e?.event_id === 'cs_live_abc');
	check('naming the SKU', JSON.stringify(e?.custom_data.content_ids) === '["CMP-XH-STOCKING-GREEN-L"]', JSON.stringify(e?.custom_data));
	check('worth what was charged', e?.custom_data.value === 54.99 && e?.custom_data.currency === 'USD');
	check('with hashed buyer details', /^[0-9a-f]{64}$/.test(e?.user_data.em?.[0] ?? '') && /^[0-9a-f]{64}$/.test(e?.user_data.country?.[0] ?? ''));
}

// --- what it must not report -----------------------------------------------------
{
	sent.length = 0;
	const other = await (await worker.fetch(signed(session({ slug: 'pouch-pet-hoodie' })), env, ctx)).json();
	check('another product’s sale is ignored', other.handled === false && sent.length === 0, JSON.stringify(other));

	const unpaid = await (await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' }, { payment_status: 'unpaid' })), env, ctx)).json();
	check('an unpaid session is not a sale', unpaid.handled === false && sent.length === 0, JSON.stringify(unpaid));

	const forged = new Request(`${ORIGIN}/api/stripe-webhook`, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: JSON.stringify(session({ slug: 'christmas-pouch-hoodie' })) });
	const res = await worker.fetch(forged, env, ctx);
	check('an unsigned event is refused', res.status === 400 && sent.length === 0);
}

// --- browser events get their server copy, same id ---------------------------------
{
	sent.length = 0;
	waits.length = 0;
	const beacon = (name, data) =>
		worker.fetch(
			new Request(`${ORIGIN}/api/event`, {
				method: 'POST',
				headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'test', Cookie: '_fbp=fb.1.1.2' },
				body: JSON.stringify({ name, id: `id-${name}-123`, url: `${ORIGIN}/?fbclid=abc`, data })
			}),
			env,
			ctx
		);
	const cart = { content_type: 'product', content_ids: ['CMP-XH-SANTA-RED-M', 'evil'], contents: [{ id: 'CMP-XH-SANTA-RED-M', quantity: 1, item_price: 54.99 }], num_items: 1, value: 54.99, currency: 'USD' };
	const r1 = await beacon('AddToCart', cart);
	await beacon('InitiateCheckout', cart);
	await beacon('Purchase', cart);
	await Promise.all(waits);
	check('beacons answer 204 at once', r1.status === 204);
	const names = sent.map((s) => s.body.data[0].event_name);
	check('AddToCart and InitiateCheckout are mirrored', names.includes('AddToCart') && names.includes('InitiateCheckout'), names.join());
	check('a browser cannot claim a Purchase', !names.includes('Purchase'));
	const add = sent.find((s) => s.body.data[0].event_name === 'AddToCart')?.body.data[0];
	check('the server copy keeps the browser’s event id', add?.event_id === 'id-AddToCart-123');
	check('unknown content ids are dropped', JSON.stringify(add?.custom_data.content_ids) === '["CMP-XH-SANTA-RED-M"]', JSON.stringify(add?.custom_data));
	check('fbp and fbc ride along', add?.user_data.fbp === 'fb.1.1.2' && /^fb\.1\.\d+\.abc$/.test(add?.user_data.fbc ?? ''));
}

// --- fbc: the click id on the URL wins over a stale cookie ---------------------------
{
	const fbcFor = async (cookie, url) => {
		sent.length = 0;
		waits.length = 0;
		await worker.fetch(
			new Request(`${ORIGIN}/api/event`, {
				method: 'POST',
				headers: { Cookie: cookie },
				body: JSON.stringify({ name: 'PageView', id: 'id-PageView-123', url, data: {} })
			}),
			env,
			ctx
		);
		await Promise.all(waits);
		return sent[0]?.body.data[0].user_data.fbc;
	};
	const stale = await fbcFor('_fbp=fb.1.1.2; _fbc=fb.1.1554763741205.OldClick', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('a cookie from an earlier click gives way to the URL’s', /^fb\.1\.\d+\.NeW_Click-Id$/.test(stale ?? '') && !stale.startsWith('fb.1.1554763741205.'), stale);
	const same = await fbcFor('_fbc=fb.1.1554763741205.NeW_Click-Id', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('a cookie carrying the same click keeps its timestamp', same === 'fb.1.1554763741205.NeW_Click-Id', same);
	const noUrl = await fbcFor('_fbc=fb.1.1554763741205.OldClick', `${ORIGIN}/`);
	check('with no click on the URL the cookie is sent as it is', noUrl === 'fb.1.1554763741205.OldClick', noUrl);
	const caseOnly = await fbcFor('_fbc=fb.1.1554763741205.new_click-id', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('the click id is never lowercased', /\.NeW_Click-Id$/.test(caseOnly ?? ''), caseOnly);
}

// --- a token pasted by hand into the dashboard ----------------------------------------
{
	const { META_CAPI_ACCESS_TOKEN, ...rest } = env;
	const sale = (e) => worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' })), e, ctx);

	sent.length = 0;
	const padded = await sale({ ...rest, 'META_CAPI_ACCESS_TOKEN ': '  token\n' });
	check('a stray space in the name or value still finds the token', padded.status === 200 && sent[0]?.url.endsWith('access_token=token'), sent[0]?.url);

	const empty = await (await sale({ ...rest, META_CAPI_ACCESS_TOKEN: '' })).json();
	check('an empty token is named as empty, not missing', empty.reason === 'META_CAPI_ACCESS_TOKEN is set but empty', empty.reason);

	const none = await (await sale(rest)).json();
	check('no token at all is named as missing', none.reason === 'missing META_CAPI_ACCESS_TOKEN', none.reason);
}

if (failures) {
	console.log(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nChristmas hoodie worker OK.');
