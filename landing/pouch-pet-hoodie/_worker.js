/*
 * The server half of the page's Meta tracking: Cloudflare Pages runs this
 * "advanced mode" worker in front of the static files.
 *
 * The browser pixel is the half that iOS and ad blockers eat, and Purchase is
 * the event that dies most. So every browser event also gets a Conversions API
 * copy from here, under the same event id, and Meta keeps one of the two. Only
 * META_PIXEL_ID gets these copies: a CAPI token belongs to exactly one dataset,
 * so it must be the pixel the ad set optimises against.
 *
 *   POST /api/event     PageView, ViewContent, InitiateCheckout
 *   POST /api/purchase  Purchase, only for a Checkout Session Stripe says is paid
 *
 * Secrets, on the Pages project (Settings → Variables and Secrets, Production):
 *   META_CAPI_ACCESS_TOKEN  generated in Events Manager for META_PIXEL_ID
 *   STRIPE_SECRET_KEY       a restricted key with Checkout Sessions: Read
 *   META_TEST_EVENT_CODE    optional; routes events to Test Events instead
 *
 * Tracking must never break the page: without a secret the endpoint does
 * nothing, and every failure is logged rather than returned to the buyer.
 */

const PIXEL_ID = '1341978141149107';
const PAYMENT_LINK = 'plink_1ULu2aJOsB1nguzlIzkLcmZG';
const GRAPH = 'https://graph.facebook.com/v25.0';
const PRODUCT_ID = 'pouch-pet-hoodie';

// Purchase is deliberately absent: a public endpoint must not be able to claim
// a sale. Sales come from /api/purchase, which asks Stripe first.
const BROWSER_EVENTS = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === '/api/event' || pathname === '/api/purchase') {
			if (request.method !== 'POST') return new Response(null, { status: 405 });
			const body = await readJson(request);
			if (!body) return new Response(null, { status: 400 });
			const job = pathname === '/api/event' ? browserEvent(request, env, body) : purchase(request, env, body);
			// Answer at once and send in the background: the InitiateCheckout
			// beacon is fired on the way out to Stripe and nobody waits on it.
			ctx.waitUntil(job.catch((e) => console.error('capi:', e && e.message)));
			return new Response(null, { status: 204 });
		}
		return env.ASSETS.fetch(request);
	}
};

async function browserEvent(request, env, body) {
	if (!BROWSER_EVENTS.has(body.name) || !validId(body.id)) return;
	const url = sameSiteUrl(request, body.url);
	if (!url) return;
	await send(env, {
		event_name: body.name,
		event_id: body.id,
		event_source_url: url,
		user_data: await userData(request, url),
		custom_data: customData(body.data)
	});
}

async function purchase(request, env, body) {
	const id = body.session_id;
	if (typeof id !== 'string' || !/^cs_(live|test)_[A-Za-z0-9]{1,200}$/.test(id)) return;
	if (!env.STRIPE_SECRET_KEY) return console.error('capi: STRIPE_SECRET_KEY not set, Purchase not sent');

	const res = await fetch('https://api.stripe.com/v1/checkout/sessions/' + id, {
		headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY }
	});
	if (!res.ok) return console.error('capi: Stripe session lookup', res.status);
	const s = await res.json();
	// Only a finished, paid order from this page's own Payment Link is a sale.
	// Anything else on the account (another product, an abandoned session, a
	// made-up id) is not reported.
	if (s.status !== 'complete' || s.payment_status !== 'paid' || s.payment_link !== PAYMENT_LINK) return;

	const url = sameSiteUrl(request, body.url) || new URL('/thank-you', request.url).href;
	// The buyer is who clicked the ad, so their own details come first; the
	// shipping name and address may be a gift's recipient, and only fill in
	// what Stripe did not collect for the buyer (often just country and zip).
	const c = s.customer_details || {};
	const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
	const own = c.address || {};
	const addr = own.city ? own : { ...(ship.address || {}), ...pick(own) };
	const names = splitName(c.name || ship.name);
	await send(env, {
		event_name: 'Purchase',
		// The browser's Purchase uses the session id too, so the two dedupe.
		event_id: id,
		event_source_url: url,
		user_data: await userData(request, url, {
			em: c.email && c.email.trim().toLowerCase(),
			ph: c.phone && c.phone.replace(/\D/g, '').replace(/^0+/, ''),
			fn: names.first,
			ln: names.last,
			ct: addr.city && squash(addr.city),
			st: twoLetters(addr.state),
			zp: addr.postal_code && zip(addr.postal_code),
			country: twoLetters(addr.country)
		}),
		custom_data: {
			value: s.amount_total / 100,
			currency: String(s.currency).toUpperCase(),
			content_ids: [PRODUCT_ID],
			content_type: 'product',
			num_items: 1,
			order_id: id
		}
	});
}

async function send(env, event) {
	if (!env.META_CAPI_ACCESS_TOKEN) return console.error('capi: META_CAPI_ACCESS_TOKEN not set,', event.event_name, 'not sent');
	const payload = { data: [{ ...event, event_time: Math.floor(Date.now() / 1000), action_source: 'website' }] };
	if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;
	const res = await fetch(`${GRAPH}/${env.META_PIXEL_ID || PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) console.error('capi:', event.event_name, res.status, await res.text());
}

// The four request-side fields go unhashed; everything a buyer typed is
// hashed, and empty fields are omitted rather than sent as hashes of nothing.
async function userData(request, url, typed = {}) {
	const out = {};
	for (const [key, value] of Object.entries(typed)) if (value) out[key] = [await sha256(value)];
	const ip = request.headers.get('CF-Connecting-IP');
	const ua = request.headers.get('User-Agent');
	const cookies = parseCookies(request.headers.get('Cookie'));
	if (ip) out.client_ip_address = ip;
	if (ua) out.client_user_agent = ua;
	if (cookies._fbp) out.fbp = cookies._fbp;
	// The pixel writes _fbc from ?fbclid= once it loads; an event that beats it
	// there builds the same value from the landing URL.
	const fbclid = new URL(url).searchParams.get('fbclid');
	if (cookies._fbc) out.fbc = cookies._fbc;
	else if (fbclid) out.fbc = `fb.1.${Date.now()}.${fbclid}`;
	return out;
}

// Browser-supplied, so only the fields and shapes these events use.
function customData(d) {
	const out = { content_ids: [PRODUCT_ID] };
	if (!d || typeof d !== 'object') return out;
	if (typeof d.value === 'number' && d.value >= 0 && d.value < 10000) out.value = d.value;
	if (typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency)) out.currency = d.currency;
	if (d.content_type === 'product') out.content_type = 'product';
	if (Number.isInteger(d.num_items) && d.num_items > 0 && d.num_items < 100) out.num_items = d.num_items;
	return out;
}

function sameSiteUrl(request, raw) {
	try {
		const url = new URL(raw);
		return url.host === new URL(request.url).host ? url.href : null;
	} catch {
		return null;
	}
}

async function readJson(request) {
	// sendBeacon posts text/plain, so parse the text whatever the content type.
	try {
		const text = await request.text();
		return text.length < 8192 ? JSON.parse(text) : null;
	} catch {
		return null;
	}
}

const pick = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

function parseCookies(header) {
	const out = {};
	for (const part of (header || '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
	}
	return out;
}

// Meta's normalisation rules, as in packages/ecomwithai/src/marketing/hash.ts.
const squash = (v) => v.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function splitName(full) {
	const parts = (full || '').trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return {};
	return { first: squash(parts[0]), last: parts.length > 1 ? squash(parts[parts.length - 1]) : undefined };
}

// A two-letter code or nothing: truncating "Texas" to "te" would hash to a
// value that matches nobody.
function twoLetters(v) {
	const cleaned = (v || '').trim().toLowerCase().replace(/[^a-z]/g, '');
	return cleaned.length === 2 ? cleaned : undefined;
}

function zip(v) {
	const cleaned = v.trim().toLowerCase().replace(/[\s-]/g, '');
	return /^\d{9}$/.test(cleaned) ? cleaned.slice(0, 5) : cleaned;
}

async function sha256(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
