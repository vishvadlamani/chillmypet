/**
 * Delivery options and what they cost.
 *
 * Prices are pre-formatted here because currency and locale are the store's
 * business, not the block's — "Free" and "$12.00" are two different shapes and
 * the block should render whichever it's handed.
 *
 * These are flat rates. Real carrier pricing depends on the destination, so once
 * an address exists this should be recomputed against it rather than served as a
 * fixed list — quoting $12.00 to a rural postcode that costs $28 to reach is a
 * margin leak that only shows up in the fulfilment bill.
 */

export interface ShippingRate {
	id: string;
	label: string;
	detail: string;
	price: string;
	selected?: boolean;
}

export function loadShippingRates(): ShippingRate[] {
	return [
		{
			id: 'standard',
			label: 'Standard',
			detail: '5–8 business days',
			price: 'Free',
			// Pre-selected: the free option should never be the one someone has to
			// find, and defaulting to the paid tier is a dark pattern.
			selected: true
		},
		{
			id: 'express',
			label: 'Express',
			detail: '2–3 business days',
			price: '$12.00'
		}
	];
}
