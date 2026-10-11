import type { Cookies } from '@sveltejs/kit';
import { toAmount, type Commerce, type Order } from 'ecomwithai';
import { buildFbc } from 'ecomwithai/marketing';

/**
 * One Purchase conversion, shared by every path that can report one.
 *
 * The event id is derived from the order number rather than minted per call.
 * The server event fires from the Stripe webhook and the browser event fires on
 * the success page — two different requests that can never pass a value to each
 * other — so a deterministic id is what lets Meta recognise them as one sale.
 * Order numbers are unique per store, which is the uniqueness Meta needs.
 */
export function purchaseEventId(orderNumber: string): string {
	return `purchase-${orderNumber}`;
}

export type PurchaseAttribution = {
	/** Meta's browser cookies. Absent when the customer blocks them. */
	fbp?: string;
	fbc?: string;
	clientIpAddress?: string;
	clientUserAgent?: string;
	/** This browser's first-party visitor id — Meta's `external_id`. */
	externalId?: string;
};

/**
 * First-party visitor id, reported to Meta as `external_id`.
 *
 * A visitor who reaches AddToCart has given no email or phone yet, so without
 * this the event's only identifiers are the IP, the user agent and Meta's own
 * cookies — and the cookies are exactly what an ad blocker removes. This one is
 * set by the server, survives a blocked `fbevents.js`, and is the same value the
 * pixel is initialised with, so both halves of every event name one person.
 */
export const VISITOR_COOKIE = 'vid';

const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The value goes into an inline script and a Stripe metadata field, and it
 * arrives in a cookie the client controls — so anything that isn't the UUID
 * this server mints is treated as absent.
 */
export function isVisitorId(value: unknown): value is string {
	return typeof value === 'string' && VISITOR_ID.test(value);
}

// fbclid is base64url-ish. Anything else is not a click id Meta issued, and has
// no business being written into a cookie.
const FBCLID = /^[A-Za-z0-9_-]{1,500}$/;

/**
 * Sets the identifiers the Conversions API needs, on the request that first
 * has them, and returns the visitor id.
 *
 * `_fbc` is normally written by `fbevents.js`, so a visitor who blocks it
 * arrives from an ad with `?fbclid=` and the click is gone by the next request:
 * the landing PageView could rebuild it from its own URL, but AddToCart is
 * posted to `/api/track`, whose URL never carries one. Writing it here keeps
 * the click on every later event. A new click replaces an older one, which is
 * what the pixel does too; the cookie is not httpOnly because the pixel reads
 * and maintains the same one.
 */
export function ensureAttributionCookies(cookies: Cookies, url: URL): string {
	const fbclid = url.searchParams.get('fbclid');
	if (fbclid && FBCLID.test(fbclid) && !cookies.get('_fbc')?.endsWith(`.${fbclid}`)) {
		cookies.set('_fbc', buildFbc(fbclid, Date.now()), {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			// Meta's own lifetime for the cookie.
			maxAge: 60 * 60 * 24 * 90
		});
	}

	const existing = cookies.get(VISITOR_COOKIE);
	if (isVisitorId(existing)) return existing;

	const minted = crypto.randomUUID();
	cookies.set(VISITOR_COOKIE, minted, {
		path: '/',
		// Only the server reads it; the pixel is handed the value in its snippet.
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
	return minted;
}

/**
 * Reads `_fbc`, falling back to minting one from a `fbclid` on the landing URL —
 * Meta matches far better with a click id than without, and the cookie is only
 * set if their script ran.
 */
export function attributionFrom(
	cookies: { get(name: string): string | undefined },
	url: URL,
	headers: Headers,
	clientIpAddress?: string
): PurchaseAttribution {
	const fbclid = url.searchParams.get('fbclid');
	const visitorId = cookies.get(VISITOR_COOKIE);
	return {
		fbp: cookies.get('_fbp'),
		fbc: cookies.get('_fbc') ?? (fbclid ? buildFbc(fbclid, Date.now()) : undefined),
		clientIpAddress,
		clientUserAgent: headers.get('user-agent') ?? undefined,
		externalId: isVisitorId(visitorId) ? visitorId : undefined
	};
}

/**
 * Never throws and never rejects: a marketing pixel must not be able to fail a
 * paid order. Callers dispatch this through `waitUntil` so the customer never
 * waits on Meta.
 */
export function sendPurchase(
	commerce: Commerce,
	order: Order,
	options: { eventSourceUrl: string; attribution?: PurchaseAttribution }
): Promise<void> {
	if (!commerce.meta) return Promise.resolve();

	const { shipping } = order;
	return commerce.meta
		.send({
			eventName: 'Purchase',
			eventId: purchaseEventId(order.orderNumber),
			eventSourceUrl: options.eventSourceUrl,
			user: {
				email: order.email,
				phone: shipping.phone ?? undefined,
				firstName: shipping.firstName,
				lastName: shipping.lastName,
				city: shipping.city,
				state: shipping.province ?? undefined,
				zip: shipping.postalCode,
				country: shipping.country,
				...options.attribution
			},
			customData: {
				currency: order.currency,
				value: toAmount(order.totalCents),
				content_type: 'product',
				content_ids: order.items.map((i) => i.sku),
				contents: order.items.map((i) => ({
					id: i.sku,
					quantity: i.quantity,
					item_price: i.unitPriceCents / 100
				})),
				num_items: order.items.reduce((sum, i) => sum + i.quantity, 0)
			}
		})
		.then((result) => {
			if (!result.sent) {
				console.error('Meta Purchase not sent', order.orderNumber, result.reason, result.detail);
			}
		})
		.catch((error) => {
			console.error('Meta Purchase dispatch failed', order.orderNumber, error);
		});
}
