import { fail, redirect } from '@sveltejs/kit';
import { CheckoutError, DEFAULT_SHIPPING_RATES } from 'ecomwithai';
import { isCountryCode } from '$lib/countries';
import { attributionFrom, purchaseEventId, sendPurchase } from '$lib/server/purchase';
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED = ['firstName', 'lastName', 'address1', 'city', 'postalCode', 'country'] as const;

type RequiredField = (typeof REQUIRED)[number];

export const actions: Actions = {
	default: async (event) => {
		const { request, locals, url, cookies, platform } = event;
		const { commerce } = locals;

		const form = await request.formData();
		const value = (name: string) => String(form.get(name) ?? '').trim();

		const email = value('email');
		const country = value('country');
		const fieldErrors: Partial<Record<RequiredField | 'email' | 'cart', string>> = {};

		if (!EMAIL.test(email)) fieldErrors.email = 'emailInvalid';
		for (const field of REQUIRED) {
			if (!value(field)) fieldErrors[field] = 'fieldRequired';
		}
		if (country && !isCountryCode(country)) fieldErrors.country = 'fieldRequired';

		let lines: { variantId: number; quantity: number }[] = [];
		try {
			const parsed = JSON.parse(value('lines') || '[]');
			if (Array.isArray(parsed)) {
				lines = parsed
					.map((l: Record<string, unknown>) => ({
						variantId: Number(l.variantId),
						quantity: Math.max(1, Math.min(10, Number(l.quantity) || 1))
					}))
					.filter((l) => Number.isInteger(l.variantId) && l.variantId > 0);
			}
		} catch {
			lines = [];
		}

		if (lines.length === 0) fieldErrors.cart = 'cartEmpty';

		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, { fieldErrors, values: Object.fromEntries(form) });
		}

		const methodInput = value('method');
		const method = DEFAULT_SHIPPING_RATES.some((r) => r.id === methodInput)
			? methodInput
			: 'standard';

		let order;
		try {
			order = await commerce.orders.create({
				lines,
				method,
				locale: locals.locale,
				marketingConsent: form.get('marketingConsent') === 'on',
				// Makes a double-submitted form return the first order rather than
				// placing a second one.
				idempotencyKey: value('submissionId') || undefined,
				shipping: {
					email,
					phone: value('phone') || undefined,
					firstName: value('firstName'),
					lastName: value('lastName'),
					address1: value('address1'),
					address2: value('address2') || undefined,
					city: value('city'),
					province: value('province') || undefined,
					postalCode: value('postalCode'),
					country
				}
			});
		} catch (error) {
			if (error instanceof CheckoutError) {
				const code = error.code === 'insufficient_stock' ? 'variant_unavailable' : error.code;
				return fail(409, { errorCode: code, detail: error.detail ?? null });
			}
			console.error('checkout failed', error);
			return fail(500, { errorCode: 'generic' as const, detail: null });
		}

		// The order is committed from here on. Nothing below may turn a placed
		// order into an error response.

		// With payments on, the sale is not a sale until Stripe says so, so hand
		// the customer to the hosted page and let the webhook report the
		// conversion. `_fbp`/`_fbc` ride along in metadata because the webhook is
		// a request from Stripe and has none of this customer's cookies.
		if (commerce.payments) {
			const attribution = attributionFrom(cookies, url, request.headers);
			const metadata = {
				...(attribution.fbp ? { fbp: attribution.fbp } : {}),
				...(attribution.fbc ? { fbc: attribution.fbc } : {})
			};
			const successUrl = `${url.origin}/checkout/success?order=${encodeURIComponent(order.orderNumber)}`;

			// The card form is already on the page, so what it needs back is a
			// payment intent to confirm against — not somewhere else to go. A
			// payment intent is the order total outright, which is also why the
			// bundle discount needs no coupon on this path.
			// The browser reports whether the inline fields mounted. When they did
			// not — an ad blocker on js.stripe.com is the usual reason — an intent
			// would have nothing to confirm it, so use the hosted page.
			const cardReady = value('cardReady') !== '0';
			if (locals.stripePublishableKey && cardReady) {
				try {
					const intent = await commerce.payments.startPayment({
						orderNumber: order.orderNumber,
						metadata
					});
					return {
						pay: {
							clientSecret: intent.clientSecret,
							orderNumber: order.orderNumber,
							returnUrl: successUrl
						}
					};
				} catch (error) {
					console.error('Payment intent failed', order.orderNumber, error);
					return fail(502, { errorCode: 'payment_unavailable' as const, detail: null });
				}
			}

			// No publishable key: nothing can mount, so use the hosted page.
			let checkout;
			try {
				checkout = await commerce.payments.startCheckout({
					orderNumber: order.orderNumber,
					uiMode: 'hosted',
					successUrl,
					cancelUrl: `${url.origin}/checkout?cancelled=${encodeURIComponent(order.orderNumber)}`,
					metadata
				});
			} catch (error) {
				// The order exists and holds stock, but there is nowhere to pay. Say
				// so rather than showing a confirmation for money we never took.
				// startCheckout throws rather than returning a session without a URL,
				// so this covers that too.
				console.error('Stripe checkout session failed', order.orderNumber, error);
				return fail(502, { errorCode: 'payment_unavailable' as const, detail: null });
			}

			redirect(303, checkout.url!);
		}

		// No payment provider configured: the order is as complete as it will get,
		// so report it here. This is the path the store ran on before Stripe.
		const eventId = purchaseEventId(order.orderNumber);
		const purchase = sendPurchase(commerce, order, {
			eventSourceUrl: url.href,
			attribution: attributionFrom(cookies, url, request.headers, event.getClientAddress())
		});

		// Don't make the customer wait on Meta. Called as a method —
		// destructuring waitUntil loses `this` and throws on Workers.
		const context = platform?.context;
		if (context && typeof context.waitUntil === 'function') {
			context.waitUntil(purchase);
		}

		return { success: true as const, order, email, eventId };
	}
};
