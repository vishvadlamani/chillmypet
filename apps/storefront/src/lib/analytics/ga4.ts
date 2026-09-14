import { browser } from '$app/environment';

declare global {
	interface Window {
		dataLayer?: unknown[];
		gtag?: (...args: unknown[]) => void;
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
 * GA4 ecommerce events, sent straight to gtag.js.
 *
 * This used to push a GTM-shaped `ecommerce` object into `window.dataLayer` for
 * whatever was published in the container to read. Nothing was: the container
 * served zero tags, so every event here was collected and discarded, and the
 * page paid ~330KB for the runtime that discarded it. Talking to gtag.js
 * directly also means nobody can publish code into this storefront without a
 * commit.
 *
 * Deliberately separate from `pixel.ts`, and Meta's events stay there: a Meta
 * tag fed from here would double-count against the snippet in
 * `hooks.server.ts`, and could not carry the derived Purchase `event_id` that
 * keeps the browser and Conversions API halves deduplicated.
 *
 * Silent until `GA4_MEASUREMENT_ID` is set — `gtag` only exists when
 * `hooks.server.ts` rendered the loader for it.
 *
 * No `ecommerce: null` reset any more. That was a workaround for GTM's data
 * model merging pushes, which leaked one event's items into the next; each
 * gtag call carries its own parameters and merges with nothing.
 */
export function ga4Event(name: string, ecommerce: Ga4Ecommerce): void {
	if (!browser || typeof window.gtag !== 'function') return;
	window.gtag('event', name, ecommerce);
}
