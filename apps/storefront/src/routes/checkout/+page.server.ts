import { bindDefinition, createRefResolver } from '@funnel/core';
import { CHECKOUT_PAGE } from '$lib/store/checkout-manifest';
import { loadMarkets } from '$lib/store/markets';
import { loadShippingRates } from '$lib/store/shipping-rates';
import { placeOrder } from '$lib/server/checkout';
import { createTranslator } from '$lib/i18n';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { locale, store } = locals;

	// The manifest's own headings come from the language packs, so the checkout
	// reads in one language rather than switching to English below the title.
	const t = createTranslator(locale);

	const resolve = createRefResolver({
		markets: loadMarkets(locale),
		shipping: { rates: loadShippingRates(locale, store.currency) },
		copy: {
			title: t('checkout.title'),
			contact: t('checkout.contactTitle'),
			contactNote: t('checkout.emailHint'),
			shipping: t('checkout.shippingTitle'),
			shippingNote: t('checkout.shippingNote'),
			method: t('checkout.methodTitle')
		}
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
		// Publishable by design; it identifies the account to Stripe.js. Without
		// it there is nothing to mount, so checkout falls back to the hosted page
		// rather than dead-ending.
		stripePublishableKey: locals.stripePublishableKey,
		// Also needed in the browser: in deferred mode the Payment Element decides
		// which methods to draw before any intent exists.
		stripePaymentMethodConfiguration: locals.stripePaymentMethodConfiguration,
		// A second Meta pixel, for an ad account that measures this checkout
		// separately from the store's own. Public by nature — it identifies the
		// dataset to the browser — and set as a plain var in wrangler.toml, so
		// changing ad accounts is a config change rather than a code one.
		checkoutPixelId: env.META_CHECKOUT_PIXEL_ID ?? locals.settings.meta_checkout_pixel_id ?? '',
		// Stripe sends the customer back here when they abandon the hosted page.
		cancelled: url.searchParams.has('cancelled')
	};
};

// The blocks draw the fields; what happens when they're submitted is not
// something a manifest gets to vary.
export const actions: Actions = {
	default: (event) => placeOrder(event, { cancelPath: '/checkout' })
};
