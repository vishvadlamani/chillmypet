import { bindDefinition, createRefResolver } from '@funnel/core';
import { classicCheckout } from '$lib/store/one-page-checkout';
import { CHECKOUT_PAGE } from '$lib/store/checkout-manifest';
import { placeOrder } from '$lib/server/checkout';
import { classicCheckoutSources, checkoutPayment, checkoutSources } from '$lib/server/checkout-page';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const classic = classicCheckoutSources(locals);
	const resolve = createRefResolver({ ...checkoutSources(locals), classic });
	const { definition, version } = bindDefinition(classicCheckout(CHECKOUT_PAGE), resolve);

	return { definition, version, look: 'classic' as const, arrival: classic.rates.find((rate) => rate.id === 'standard')?.detail ?? '', ...checkoutPayment(locals, url) };
};

// The blocks draw the fields; what happens when they're submitted is not
// something a manifest gets to vary.
export const actions: Actions = {
	default: (event) => placeOrder(event, { cancelPath: '/checkout' })
};
