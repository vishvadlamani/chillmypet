/**
 * Pixel/dataset id. Public by design — it ships in the page source and in every
 * `/tr` request, so it is not a secret. The CAPI *access token* is, and lives
 * only in `META_CAPI_ACCESS_TOKEN`.
 */
export const META_PIXEL_ID = '28272021345717397';

export type MetaEventName =
	| 'PageView'
	| 'ViewContent'
	| 'AddToCart'
	| 'InitiateCheckout'
	| 'Purchase';

export type MetaCustomData = {
	currency?: string;
	value?: string;
	content_type?: 'product' | 'product_group';
	content_ids?: string[];
	contents?: { id: string; quantity: number; item_price?: number }[];
	num_items?: number;
};

/** Meta wants value as a decimal string, and cents-to-currency must not drift. */
export function toAmount(cents: number): string {
	return (cents / 100).toFixed(2);
}

/**
 * Shared id for one logical conversion. The browser and the server both send
 * the Purchase with this id so Meta counts it once instead of twice.
 */
export function newEventId(): string {
	return crypto.randomUUID();
}
