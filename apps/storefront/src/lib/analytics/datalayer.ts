import { browser } from '$app/environment';

declare global {
	interface Window {
		dataLayer?: unknown[];
	}
}

/** GA4's item shape. Prices are decimal units, not cents. */
export type Ga4Item = {
	item_id: string;
	item_name?: string;
	price?: number;
	quantity?: number;
};

export type Ga4Ecommerce = {
	currency?: string;
	value?: number;
	/** Purchase only. GA4 dedupes repeat sends of a sale on this. */
	transaction_id?: string;
	items: Ga4Item[];
};

/** Cents to the decimal number GA4 wants, without float drift. */
export function amount(cents: number): number {
	return Number((cents / 100).toFixed(2));
}

/**
 * GA4 ecommerce events, pushed to `window.dataLayer`.
 *
 * Nothing reads them today: the GTM container that did was removed, and no
 * gtag.js loads in its place, so these pushes accumulate and stop there. Kept
 * because the data model is correct and the call sites already produce it —
 * load GA4 directly and it measures again.
 *
 * Deliberately separate from `pixel.ts`, and it stays that way: Meta's events
 * belong on the pixel, because anything built on this dataLayer would
 * double-count against the snippet in `hooks.server.ts` and could not carry the
 * derived Purchase `event_id` that keeps the browser and Conversions API halves
 * deduplicated.
 *
 * The `ecommerce: null` push first is Google's own guidance: the data model
 * merges pushes, so without it the previous event's items leak into this one.
 */
export function pushEcommerce(event: string, ecommerce: Ga4Ecommerce): void {
	if (!browser) return;
	window.dataLayer = window.dataLayer ?? [];
	window.dataLayer.push({ ecommerce: null });
	window.dataLayer.push({ event, ecommerce });
}
