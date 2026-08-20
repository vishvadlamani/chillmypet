/**
 * Shipping options, read from the rates the order is actually priced against.
 *
 * Restating them here would let the checkout show a price the server does not
 * charge — the rate table is the same one `orders.create()` resolves against.
 */
import { DEFAULT_SHIPPING_RATES } from 'ecomwithai';
import { createTranslator, formatMoney, type Locale } from '$lib/i18n';

export interface ShippingRate {
	id: string;
	label: string;
	detail: string;
	price: string;
	selected?: boolean;
}

export function loadShippingRates(locale: Locale, currency = 'USD'): ShippingRate[] {
	const t = createTranslator(locale);

	return DEFAULT_SHIPPING_RATES.map((rate, index) => ({
		id: rate.id,
		label: rate.id === 'express' ? t('checkout.methodExpress') : t('checkout.methodStandard'),
		detail:
			rate.id === 'express' ? t('checkout.methodExpressEta') : t('checkout.methodStandardEta'),
		price: rate.priceCents === 0 ? t('checkout.free') : formatMoney(rate.priceCents, locale, currency),
		selected: index === 0
	}));
}
