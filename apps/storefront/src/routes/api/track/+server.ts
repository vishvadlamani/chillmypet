import { attributionFrom } from '$lib/server/purchase';
import type { MetaCustomData, MetaEventName } from 'ecomwithai/marketing';
import type { RequestHandler } from './$types';

/**
 * The server half of the funnel events the browser fires.
 *
 * Meta counts an event once per `event_id` + `event_name`, so the browser sends
 * both halves the same id and this reports the copy that survives an ad
 * blocker, ITP, or a tab closed before `fbevents.js` loaded. Without it the
 * dataset only ever sees the browser's version of everything except Purchase,
 * which is what Events Manager reports as the server sending fewer events.
 */

/**
 * Purchase is deliberately absent. It is reported from the order — the Stripe
 * webhook, or the checkout action when payments are off — because that is where
 * money moving is known. Accepting it here would put a public endpoint in front
 * of the one event the ad account bids on.
 */
const MIRRORED = new Set<MetaEventName>([
	'PageView',
	'ViewContent',
	'AddToCart',
	'InitiateCheckout',
	'AddPaymentInfo'
]);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown): number | undefined =>
	typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/**
 * Only the keys Meta reads, each type-checked. The body is from the page, so it
 * is a claim rather than a fact — a wrong shape should drop a field, never
 * reach Meta as-is or throw.
 */
function cleanCustomData(input: unknown): MetaCustomData | undefined {
	if (!input || typeof input !== 'object') return undefined;
	const d = input as Record<string, unknown>;
	const out: Record<string, unknown> = {};

	if (str(d.content_type)) out.content_type = d.content_type;
	if (str(d.currency)) out.currency = d.currency;
	// Meta wants value as a decimal string; the browser already formats it.
	if (str(d.value) ?? num(d.value) !== undefined) out.value = String(d.value);
	if (num(d.num_items) !== undefined) out.num_items = d.num_items;

	if (Array.isArray(d.content_ids)) {
		const ids = d.content_ids.filter((v): v is string => typeof v === 'string').slice(0, 100);
		if (ids.length) out.content_ids = ids;
	}
	if (Array.isArray(d.contents)) {
		const rows = d.contents
			.filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
			.slice(0, 100)
			.map((c) => ({
				id: str(c.id) ?? '',
				quantity: num(c.quantity) ?? 1,
				item_price: num(c.item_price) ?? 0
			}))
			.filter((c) => c.id);
		if (rows.length) out.contents = rows;
	}

	return Object.keys(out).length ? (out as MetaCustomData) : undefined;
}

export const POST: RequestHandler = async ({ request, locals, url, cookies, platform, getClientAddress }) => {
	// 204 in every branch below: this is a tracking beacon, and a page must never
	// see an error from one. Failures are logged, not surfaced.
	const done = new Response(null, { status: 204 });

	const meta = locals.commerce.meta;
	if (!meta) return done;

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return done;
	}

	const eventName = str(body.eventName) as MetaEventName | undefined;
	const eventId = str(body.eventId);
	if (!eventName || !eventId || !MIRRORED.has(eventName)) return done;

	const send = meta
		.send({
			eventName,
			eventId,
			eventSourceUrl: str(body.eventSourceUrl) ?? url.href,
			// Never taken from the body. Cookies, IP and user agent are what this
			// request actually carries, and a page cannot claim to be someone else.
			user: attributionFrom(cookies, url, request.headers, getClientAddress()),
			customData: cleanCustomData(body.customData)
		})
		.then((result) => {
			if (!result.sent) console.error('Meta CAPI mirror not sent', eventName, result.reason);
		})
		.catch((error) => console.error('Meta CAPI mirror failed', eventName, error));

	// Called as a method — destructuring waitUntil loses `this` and throws on the
	// Workers runtime.
	const context = platform?.context;
	if (context && typeof context.waitUntil === 'function') context.waitUntil(send);

	return done;
};
