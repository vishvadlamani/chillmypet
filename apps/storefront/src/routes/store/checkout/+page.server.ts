import { bindDefinition, createRefResolver } from '@funnel/core';
import { CHECKOUT_PAGE } from './manifest';
import { loadMarkets } from '../markets';
import { loadShippingRates } from '../shipping-rates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const resolve = createRefResolver({
		markets: loadMarkets(),
		shipping: { rates: loadShippingRates() }
	});
	const { definition, version } = bindDefinition(CHECKOUT_PAGE, resolve);

	return { definition, version };
};
