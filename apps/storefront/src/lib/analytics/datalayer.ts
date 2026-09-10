import { browser } from '$app/environment';

declare global {
	interface Window {
		dataLayer?: unknown[];
	}
}

/** GA4's item shape. Prices are decimal units, not cents. */
export type GtmItem = {
	item_id: string;
	item_name?: string;
	price?: number;
	quantity?: number;
};

export type GtmEcommerce = {
	currency?: string;
	value?: number;
	/** Purchase only. GA4 dedupes repeat sends of a sale on this. */
	transaction_id?: string;
	items: GtmItem[];
};

/** Cents to the decimal number GA4 wants, without float drift. */
export function amount(cents: number): number {
	return Number((cents / 100).toFixed(2));
}

/**
 * GA4 ecommerce events, for whatever is published in the GTM container.
 *
 * Deliberately separate from `pixel.ts`. The container is a second publishing
 * surface, so it gets a documented data model to read rather than tags reaching
 * into the app — and Meta's own events stay on the pixel, because a Meta tag
 * built on this dataLayer would double-count against the snippet in
 * `hooks.server.ts` and could not carry the derived Purchase `event_id` that
 * keeps the browser and Conversions API halves deduplicated.
 *
 * The `ecommerce: null` push first is Google's own guidance: the data model
 * merges pushes, so without it the previous event's items leak into this one.
 */
export function pushEcommerce(event: string, ecommerce: GtmEcommerce): void {
	if (!browser) return;
	window.dataLayer = window.dataLayer ?? [];
	window.dataLayer.push({ ecommerce: null });
	window.dataLayer.push({ event, ecommerce });
}
