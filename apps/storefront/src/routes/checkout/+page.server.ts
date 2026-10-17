import { bindDefinition, createRefResolver } from '@funnel/core';
import { CHECKOUT_PAGE } from '$lib/store/checkout-manifest';
import { placeOrder } from '$lib/server/checkout';
import { checkoutPayment, checkoutSources } from '$lib/server/checkout-page';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const resolve = createRefResolver(checkoutSources(locals));
	const { definition, version } = bindDefinition(CHECKOUT_PAGE, resolve);

	return { definition, version, ...checkoutPayment(locals, url) };
};

// The blocks draw the fields; what happens when they're submitted is not
// something a manifest gets to vary.
export const actions: Actions = {
	default: (event) => placeOrder(event, { cancelPath: '/checkout' })
};
