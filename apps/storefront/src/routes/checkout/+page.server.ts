import { placeOrder } from '$lib/server/checkout';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => ({
	// Drives the copy and the button label. The form posts to the same action
	// either way — this only decides what the customer is told happens next.
	paymentsEnabled: Boolean(locals.commerce.payments),
	// Publishable by design; it identifies the account to Stripe.js. With it the
	// card form mounts on this page. Without it there is nothing to mount, so
	// checkout falls back to the hosted page rather than dead-ending.
	stripePublishableKey: locals.stripePublishableKey,
	stripePaymentMethodConfiguration: locals.stripePaymentMethodConfiguration,
	// Stripe sends the customer back here when they abandon the hosted page.
	cancelled: url.searchParams.has('cancelled')
});

// The order itself is built in $lib/server/checkout — the block-rendered
// checkout posts to the same code, so the two pages cannot drift on what
// happens after submit.
export const actions: Actions = {
	default: (event) => placeOrder(event, { cancelPath: '/checkout' })
};
