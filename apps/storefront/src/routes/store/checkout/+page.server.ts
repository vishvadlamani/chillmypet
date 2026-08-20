import { bindDefinition, createRefResolver } from '@funnel/core';
import { CHECKOUT_PAGE } from './manifest';
import { loadMarkets } from '../markets';
import { loadShippingRates } from '../shipping-rates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { locale, store } = locals;

	const resolve = createRefResolver({
		markets: loadMarkets(locale),
		shipping: { rates: loadShippingRates(locale, store.currency) }
	});
	const { definition, version } = bindDefinition(CHECKOUT_PAGE, resolve);

	return {
		definition,
		version,
		// Payment is deliberately not a block — unknown block types are skipped,
		// which on a checkout would render a page that looks complete and
		// silently cannot take money. Card entry stays host code, so the host
		// needs what mounts it.
		paymentsEnabled: Boolean(locals.commerce.payments),
		stripePublishableKey: locals.stripePublishableKey,
		stripePaymentMethodConfiguration: locals.stripePaymentMethodConfiguration
	};
};
