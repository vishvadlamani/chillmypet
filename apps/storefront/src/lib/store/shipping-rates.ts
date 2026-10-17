/**
 * Shipping options, read from the rates the order is actually priced against.
 *
 * Restating them here would let the checkout show a price the server does not
 * charge — the rate table is the same one `orders.create()` resolves against.
 */
import { DEFAULT_SHIPPING_RATES, type ShippingRate } from 'ecomwithai';
import { createTranslator, formatMoney, type Locale } from '$lib/i18n';

export interface ShippingRateOption {
	id: string;
	label: string;
	detail: string;
	price: string;
	selected?: boolean;
}

/**
 * The rates this store offers, and the only ones it charges.
 *
 * Standard only, since 2026-10-17, on the owner's call: Express promised 2–3
 * business days that a dropshipped order (2–4 business days to pack, then
 * the carrier) cannot keep. The framework's defaults still list Express, so
 * this table is what reaches every place a rate is read: the methods the
 * checkout shows, the total it adds up, the method the order action accepts,
 * and `orders.create()` through `createCommerce({ shippingRates })` in
 * hooks.server.ts, which prices the order. A posted `method=express` is
 * charged as Standard. To bring Express back, add it here, with a promise
 * the supplier can meet.
 */
export const SHIPPING_RATES: ShippingRate[] = DEFAULT_SHIPPING_RATES.filter(
	(rate) => rate.id === 'standard'
);

export function loadShippingRates(locale: Locale, currency = 'USD'): ShippingRateOption[] {
	const t = createTranslator(locale);

	return SHIPPING_RATES.map((rate, index) => ({
		id: rate.id,
		label: rate.id === 'express' ? t('checkout.methodExpress') : t('checkout.methodStandard'),
		detail:
			rate.id === 'express' ? t('checkout.methodExpressEta') : t('checkout.methodStandardEta'),
		price: rate.priceCents === 0 ? t('checkout.free') : formatMoney(rate.priceCents, locale, currency),
		selected: index === 0
	}));
}
