import { toAmount, type Commerce, type Order } from 'ecomwithai';
import { resolveFbc } from 'ecomwithai/marketing';
import { withCallingCode } from '$lib/server/identity';

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
	/** Our own visitor id, sent as `external_id`. See `ensureVisitorId`. */
	externalId?: string;
	clientIpAddress?: string;
	clientUserAgent?: string;
};

type CookieJar = {
	get(name: string): string | undefined;
	set(name: string, value: string, opts: { path: string; httpOnly?: boolean; sameSite?: 'lax'; maxAge?: number }): void;
};

const VISITOR_COOKIE = 'cmp_vid';
const VISITOR_ID = /^[a-f0-9]{64}$/;

export function visitorId(cookies: { get(name: string): string | undefined }): string | undefined {
	const value = cookies.get(VISITOR_COOKIE);
	return value && VISITOR_ID.test(value) ? value : undefined;
}

/**
 * The visitor's `external_id`: one id, on the pixel's init and on every
 * Conversions API copy, so Meta can tie a ViewContent, an InitiateCheckout and
 * the Purchase to the same person even where no email has been typed yet —
 * which, on a landing page, is everywhere.
 *
 * 64 hex characters on purpose. The pixel sends a value shaped like a SHA-256
 * digest as it is and hashes anything else, and `buildUserData` follows the
 * same rule, so this exact string is what both halves carry. Any other shape
 * and one of them hashes it while the other does not, and the two copies never
 * match. Random, never derived from anything about the person.
 *
 * httpOnly because only the server reads it: it is written into the init call
 * in the page itself. Call before `resolve()`, so the cookie rides on this
 * response and later reads in the same request see it.
 */
export function ensureVisitorId(cookies: CookieJar): string {
	const existing = visitorId(cookies);
	if (existing) return existing;

	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	cookies.set(VISITOR_COOKIE, id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
	return id;
}

/**
 * Reads `_fbc`, or mints one from a `fbclid` on the page's URL — Meta matches
 * far better with a click id than without, and the cookie is only set if their
 * script ran. `pageUrl` is the page the event happened on, which for a beacon is
 * not the request's own URL.
 */
export function attributionFrom(
	cookies: { get(name: string): string | undefined },
	pageUrl: URL,
	headers: Headers,
	clientIpAddress?: string
): PurchaseAttribution {
	return {
		fbp: cookies.get('_fbp'),
		fbc: resolveFbc(cookies.get('_fbc'), pageUrl.searchParams.get('fbclid'), Date.now()),
		externalId: visitorId(cookies),
		clientIpAddress,
		clientUserAgent: headers.get('user-agent') ?? undefined
	};
}

// Stripe metadata keys, and Stripe's own cap on a value. A request carrying a
// longer one is refused whole, so an oversized value is left out instead.
const METADATA_KEYS = {
	fbp: 'fbp',
	fbc: 'fbc',
	externalId: 'external_id',
	clientIpAddress: 'client_ip',
	clientUserAgent: 'client_ua'
} as const satisfies Record<keyof PurchaseAttribution, string>;
const STRIPE_METADATA_MAX = 500;

/**
 * The customer's attribution, packed into Stripe metadata for the webhook.
 *
 * The webhook that reports the sale is a request from Stripe: none of this
 * customer's cookies, address or user agent are on it. Without these the
 * Purchase reached Meta with no `client_user_agent`, which Meta lists as
 * required for a website event — such an event is accepted but may not be
 * used for optimisation or measurement, and Events Manager scored Purchase's
 * match quality at 0. Taken from the checkout request, the customer's own.
 */
export function attributionMetadata(attribution: PurchaseAttribution): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [field, key] of Object.entries(METADATA_KEYS)) {
		const value = attribution[field as keyof PurchaseAttribution];
		if (value && value.length <= STRIPE_METADATA_MAX) out[key] = value;
	}
	return out;
}

/** The other end of `attributionMetadata`, from a verified Stripe object. */
export function attributionFromMetadata(metadata: Record<string, unknown>): PurchaseAttribution {
	const out: PurchaseAttribution = {};
	for (const [field, key] of Object.entries(METADATA_KEYS)) {
		const value = metadata[key];
		if (typeof value === 'string' && value) out[field as keyof PurchaseAttribution] = value;
	}
	return out;
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
				// With its calling code, so it hashes the same as the copy the
				// earlier PageView and ViewContent events sent from the cookie.
				phone: shipping.phone ? withCallingCode(shipping.phone, shipping.country) : undefined,
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
