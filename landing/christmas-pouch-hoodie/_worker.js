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
 *   POST /api/event           PageView, ViewContent, AddToCart, InitiateCheckout
 *   POST /api/stripe-webhook  Purchase, when Stripe says a Christmas hoodie
 *                             session is paid
 *
 * This file is the page's only server code. While a _worker.js exists, Pages
 * ignores a functions/ folder entirely, so a route added there is never
 * served: the Pouch Pet Hoodie's webhook once lived in functions/ and Stripe's
 * deliveries got a 405 from the static files.
 *
 * Secrets, on the Pages project (Settings → Variables and Secrets, Production):
 *   META_CAPI_ACCESS_TOKEN  generated in Events Manager for META_PIXEL_ID
 *   STRIPE_WEBHOOK_SECRET   whsec_… of the ChillMP endpoint pointed at
 *                           this site's /api/stripe-webhook
 *   META_TEST_EVENT_CODE    optional; routes events to Test Events instead
 *
 * Browser events must never break the page: without a secret /api/event does
 * nothing and every failure is only logged. The webhook is the opposite: it
 * does nothing but report, so a failure is a non-2xx that Stripe retries for
 * three days and shows in its Dashboard, instead of a sale quietly lost.
 */

const PIXEL_ID = '1341978141149107';
const THANK_YOU = 'https://chillmypet-christmas.pages.dev/thank-you.html';
// How old a Stripe signature may be, as Stripe's own libraries allow.
const SIGNATURE_TOLERANCE = 300;
const GRAPH = 'https://graph.facebook.com/v25.0';
const PRODUCT_ID = 'christmas-pouch-hoodie';
// One Payment Link per design and size; each link's metadata names its SKU,
// which spells both out (CMP-XH-STOCKING-GREEN-L). Anything else a browser
// sends as a content id is dropped.
const SKU = /^CMP-XH-[A-Z]+-[A-Z]+-(S|M|L|XL|2XL)$/;

// Purchase is deliberately absent: a public endpoint must not be able to claim
// a sale. Sales come from /api/stripe-webhook, which only Stripe can sign.
const BROWSER_EVENTS = new Set(['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout']);

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === '/api/stripe-webhook') {
			if (request.method !== 'POST') return new Response(null, { status: 405 });
			return stripeWebhook(request, env);
		}
		if (pathname === '/api/event') {
			if (request.method !== 'POST') return new Response(null, { status: 405 });
			const body = await readJson(request);
			if (!body) return new Response(null, { status: 400 });
			// Answer at once and send in the background: AddToCart and
			// InitiateCheckout are fired on the way out to Stripe and nobody
			// waits on them.
			ctx.waitUntil(browserEvent(request, env, body).catch((e) => console.error('capi:', e && e.message)));
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

async function stripeWebhook(request, env) {
	// 503 rather than 200 while unconfigured, so Stripe keeps retrying and a
	// sale made before the secret is set is reported once it is.
	if (!env.STRIPE_WEBHOOK_SECRET) return json({ handled: false, reason: 'missing STRIPE_WEBHOOK_SECRET' }, 503);
	if (!env.META_CAPI_ACCESS_TOKEN) return json({ handled: false, reason: 'missing META_CAPI_ACCESS_TOKEN' }, 503);

	// The exact bytes Stripe signed: parsing and re-serialising would change them.
	const raw = await request.text();
	if (!(await validStripeSignature(raw, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET))) {
		return json({ handled: false, reason: 'invalid_signature' }, 400);
	}
	const event = JSON.parse(raw);
	const s = event.data && event.data.object;

	// A card sale completes "paid". A delayed method (a bank debit) completes
	// "unpaid" and settles later with async_payment_succeeded, which is the
	// sale; reporting the first would count money that may never arrive.
	const settled =
		(event.type === 'checkout.session.completed' && s.payment_status === 'paid') ||
		event.type === 'checkout.session.async_payment_succeeded';
	if (!settled) return json({ handled: false, reason: 'ignored', type: event.type });
	// The account takes other products' payments too, and this endpoint sees
	// those sessions as well. Every Christmas link carries slug and sku in its
	// metadata, which Stripe copies onto each session it creates.
	const meta = s.metadata || {};
	if (meta.slug !== PRODUCT_ID) return json({ handled: false, reason: 'not_christmas_hoodie' });
	const sku = SKU.test(meta.sku || '') ? meta.sku : PRODUCT_ID;

	// The buyer is who clicked the ad, so their own details come first; the
	// shipping name and address may be a gift's recipient, and only fill in
	// what Stripe did not collect for the buyer (often just country and zip).
	const c = s.customer_details || {};
	const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || {};
	const own = c.address || {};
	const addr = own.city ? own : { ...(ship.address || {}), ...pick(own) };
	const names = splitName(c.name || ship.name);
	const sent = await send(env, {
		event_name: 'Purchase',
		// thank-you.html's browser Purchase uses the session id too, so Meta
		// keeps one of the two.
		event_id: s.id,
		// When the sale happened, not when this delivery arrived: a retry or a
		// resend from the Dashboard can come days later.
		event_time: event.created,
		event_source_url: THANK_YOU,
		// Stripe, not the buyer, makes this request, so there is no IP, user
		// agent or _fbp to send; what the buyer typed at checkout matches them.
		user_data: await hashed({
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
			content_ids: [sku],
			contents: [{ id: sku, quantity: 1, item_price: s.amount_total / 100 }],
			content_type: 'product',
			// The link fixes quantity at one.
			num_items: 1,
			order_id: s.id
		}
	});
	// Meta dedupes Stripe's retries on event_id.
	return sent ? json({ handled: true, eventId: s.id }) : json({ handled: false, reason: 'meta_rejected' }, 502);
}

// Stripe-Signature is "t=<unix>,v1=<hex>[,v1=<hex>…]": an HMAC-SHA256 of
// "<t>.<body>" under the endpoint's secret. More than one v1 appears while a
// secret is being rolled.
async function validStripeSignature(raw, header, secret) {
	const parts = (header || '').split(',').map((p) => p.split('='));
	const t = Number((parts.find(([k]) => k === 't') || [])[1]);
	const given = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
	if (!t || !given.length || Math.abs(Date.now() / 1000 - t) > SIGNATURE_TOLERANCE) return false;
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`));
	const expected = hex(mac);
	return given.some((v) => sameString(v, expected));
}

function sameString(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

const json = (body, status = 200) => Response.json(body, { status });

// True when Meta accepted the event.
async function send(env, event) {
	if (!env.META_CAPI_ACCESS_TOKEN) {
		console.error('capi: META_CAPI_ACCESS_TOKEN not set,', event.event_name, 'not sent');
		return false;
	}
	const payload = { data: [{ event_time: Math.floor(Date.now() / 1000), ...event, action_source: 'website' }] };
	if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;
	const res = await fetch(`${GRAPH}/${env.META_PIXEL_ID || PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_ACCESS_TOKEN)}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) console.error('capi:', event.event_name, res.status, await res.text());
	return res.ok;
}

// What the buyer's own request says about them, which Meta takes unhashed.
async function userData(request, url) {
	const out = {};
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

// Everything a buyer typed is hashed, and empty fields are omitted rather
// than sent as hashes of nothing.
async function hashed(typed) {
	const out = {};
	for (const [key, value] of Object.entries(typed)) if (value) out[key] = [await sha256(value)];
	return out;
}

// Browser-supplied, so only the fields and shapes these events use.
function customData(d) {
	const out = {};
	if (!d || typeof d !== 'object') return out;
	const ids = Array.isArray(d.content_ids) ? d.content_ids.filter((id) => id === PRODUCT_ID || SKU.test(id)).slice(0, 4) : [];
	if (ids.length) out.content_ids = ids;
	if (Array.isArray(d.contents)) {
		const rows = d.contents
			.filter((r) => r && SKU.test(r.id) && Number.isInteger(r.quantity) && r.quantity > 0 && r.quantity < 100)
			.slice(0, 4)
			.map((r) => ({ id: r.id, quantity: r.quantity, item_price: typeof r.item_price === 'number' && r.item_price >= 0 && r.item_price < 10000 ? r.item_price : undefined }));
		if (rows.length) out.contents = rows;
	}
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
	return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
