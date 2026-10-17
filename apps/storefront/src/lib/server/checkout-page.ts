import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { createTranslator } from '$lib/i18n';
import { loadMarkets } from '$lib/store/markets';
import { loadShippingRates } from '$lib/store/shipping-rates';

/**
 * What the checkout's blocks bind to, and what its card fields mount with.
 *
 * Shared by `/checkout` and a product's one-page checkout, so the two cannot
 * disagree about which countries, rates or payment methods the store offers.
 */
export function checkoutSources(locals: App.Locals) {
	const { locale, store } = locals;

	// The manifest's own headings come from the language packs, so the checkout
	// reads in one language rather than switching to English below the title.
	const t = createTranslator(locale);

	const markets = loadMarkets(locale);
	// The same rule `/api/address` answers by: a Places key, or the dev fixture.
	// Anywhere else the search could only ever come back empty.
	const lookup = Boolean(env.GOOGLE_PLACES_API_KEY) || dev;
	return {
		markets,
		address: lookup ? { lookup: { countries: markets.codes } } : {},
		shipping: { rates: loadShippingRates(locale, store.currency) },
		copy: {
			title: t('checkout.title'),
			contact: t('checkout.contactTitle'),
			contactNote: t('checkout.emailHint'),
			shipping: t('checkout.shippingTitle'),
			delivery: t('checkout.deliveryTitle'),
			shippingNote: t('checkout.shippingNote'),
			method: t('checkout.methodTitle')
		}
	};
}

export function checkoutPayment(locals: App.Locals, url: URL) {
	return {
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
		// Stripe sends the customer back here when they abandon the hosted page.
		cancelled: url.searchParams.has('cancelled')
	};
}
