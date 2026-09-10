/**
 * The browser half and the server half of one event, joined by an id.
 *
 * Meta counts a conversion twice unless the browser pixel and the Conversions
 * API send the *same* `event_id` for it. Purchase gets that for free — the id is
 * derived from the order number, so the webhook and the receipt page arrive at
 * it independently. Every other event has no such natural key: nothing on the
 * server knows that this `ViewContent` and that one are the same view.
 *
 * So the browser mints the id, fires the pixel with it, and posts the same event
 * back to the host, which sends the server copy. One id, two halves, one event —
 * and the server copy carries the IP, user agent and `_fbp`/`_fbc` that the
 * browser event loses to iOS and ad blockers.
 *
 * This module is the part that must not trust its input. Anything can POST to
 * the endpoint that calls it, so a payload is a *claim*: it is validated and
 * clamped into a `CapiEvent` here, or it is dropped.
 */
import type { MetaCustomData, MetaEventName } from './index.ts';

/** Every event this library knows how to send. */
export const META_EVENT_NAMES = [
	'PageView',
	'ViewContent',
	'AddToCart',
	'InitiateCheckout',
	'AddPaymentInfo',
	'Purchase'
] as const;

/**
 * The events a browser may ask the server to mirror.
 *
 * Purchase is deliberately absent, and this is the one rule in here worth
 * defending: a conversion is reported when money moves, not when a page says it
 * did. The server copy of Purchase comes from the payment webhook, against an
 * order row that was actually paid. Accepting one here would let anyone with
 * `curl` write revenue into the ad account and teach the campaign to bid on it.
 * The browser still fires its own Purchase with the shared id, so the pair still
 * dedupes — it is only the *server* half that has to be earned.
 */
export const BRIDGEABLE_EVENT_NAMES = [
	'PageView',
	'ViewContent',
	'AddToCart',
	'InitiateCheckout',
	'AddPaymentInfo'
] as const;

export type BridgeableEventName = (typeof BRIDGEABLE_EVENT_NAMES)[number];

export function isMetaEventName(value: unknown): value is MetaEventName {
	return typeof value === 'string' && (META_EVENT_NAMES as readonly string[]).includes(value);
}

export function isBridgeableEventName(value: unknown): value is BridgeableEventName {
	return (
		typeof value === 'string' && (BRIDGEABLE_EVENT_NAMES as readonly string[]).includes(value)
	);
}

/** What the browser posts back for its server half. */
export type BridgedEvent = {
	eventName: BridgeableEventName;
	eventId: string;
	eventSourceUrl?: string;
	customData?: MetaCustomData;
};

// A UUID is what the browser mints, but ids that came from elsewhere (an order
// number, a funnel step) must survive too. Wide enough for those, narrow enough
// that nothing structural can be smuggled through the field.
const EVENT_ID = /^[A-Za-z0-9._:-]{1,120}$/;
const CURRENCY = /^[A-Za-z]{3}$/;

const MAX_IDS = 50;
const MAX_ID_LENGTH = 100;
const MAX_URL_LENGTH = 2048;
const MAX_VALUE = 1_000_000;
const MAX_QUANTITY = 1000;
const MAX_ITEMS = 100_000;

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** Meta wants an amount as a decimal string; anything unusable is dropped. */
function amount(value: unknown): string | undefined {
	const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
	if (!Number.isFinite(n) || n < 0 || n > MAX_VALUE) return undefined;
	return n.toFixed(2);
}

function count(value: unknown, max: number): number | undefined {
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0 || n > max) return undefined;
	return n;
}

function id(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed && trimmed.length <= MAX_ID_LENGTH ? trimmed : undefined;
}

/**
 * Keeps only the fields Meta reads, in the shapes it reads them in.
 *
 * Passing an arbitrary object straight through is how an ad account fills with
 * custom fields nothing optimises against — and a value of `"1e9"` or `NaN` is
 * worse than no value, because it is reported as revenue.
 */
export function sanitizeCustomData(input: unknown): MetaCustomData | undefined {
	const raw = asRecord(input);
	if (!raw) return undefined;

	const data: MetaCustomData = {};

	if (typeof raw.currency === 'string' && CURRENCY.test(raw.currency)) {
		data.currency = raw.currency.toUpperCase();
	}

	const value = amount(raw.value);
	if (value !== undefined) data.value = value;

	if (raw.content_type === 'product' || raw.content_type === 'product_group') {
		data.content_type = raw.content_type;
	}

	if (Array.isArray(raw.content_ids)) {
		const ids = raw.content_ids.slice(0, MAX_IDS).map(id).filter((v): v is string => Boolean(v));
		if (ids.length > 0) data.content_ids = ids;
	}

	if (Array.isArray(raw.contents)) {
		const contents = raw.contents
			.slice(0, MAX_IDS)
			.flatMap((entry): { id: string; quantity: number; item_price?: number }[] => {
				const item = asRecord(entry);
				const sku = item && id(item.id);
				if (!item || !sku) return [];
				const quantity = count(item.quantity, MAX_QUANTITY) ?? 1;
				const price = amount(item.item_price);
				return [
					price === undefined
						? { id: sku, quantity }
						: { id: sku, quantity, item_price: Number(price) }
				];
			});
		if (contents.length > 0) data.contents = contents;
	}

	const numItems = count(raw.num_items, MAX_ITEMS);
	if (numItems !== undefined) data.num_items = numItems;

	return Object.keys(data).length > 0 ? data : undefined;
}

/**
 * Validates one posted browser event, or returns null.
 *
 * `origin` scopes `eventSourceUrl` to the site that received the request: the
 * field is what Meta attributes the event to, so accepting an arbitrary URL
 * would let this endpoint report events onto somebody else's domain.
 */
export function parseBrowserEvent(input: unknown, origin?: string): BridgedEvent | null {
	const body = asRecord(input);
	if (!body) return null;

	const eventName = body.eventName ?? body.name;
	if (!isBridgeableEventName(eventName)) return null;

	const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
	// No id, no point: an event the browser never labelled cannot dedupe, and
	// sending it anyway is exactly the double-counting this module exists to stop.
	if (!EVENT_ID.test(eventId)) return null;

	const event: BridgedEvent = { eventName, eventId };

	const sourceUrl = typeof body.eventSourceUrl === 'string' ? body.eventSourceUrl : '';
	if (sourceUrl && sourceUrl.length <= MAX_URL_LENGTH) {
		try {
			const parsed = new URL(sourceUrl);
			if (!origin || parsed.origin === origin) event.eventSourceUrl = parsed.href;
		} catch {
			// Not a URL. The caller's own request URL is the honest fallback.
		}
	}

	const customData = sanitizeCustomData(body.customData ?? body.data);
	if (customData) event.customData = customData;

	return event;
}
