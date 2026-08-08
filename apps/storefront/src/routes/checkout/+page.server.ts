import { fail } from '@sveltejs/kit';
import { CheckoutError, DEFAULT_SHIPPING_RATES, newEventId, toAmount } from 'ecomwithai';
import { buildFbc } from 'ecomwithai/marketing';
import { isCountryCode } from '$lib/countries';
import type { Actions } from './$types';

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

		// The order is committed from here on. Everything below is marketing
		// telemetry and must never turn a placed order into an error response.
		const eventId = newEventId();

		try {
			if (commerce.meta) {
				const fbclid = url.searchParams.get('fbclid');
				const purchase = commerce.meta.send({
					eventName: 'Purchase',
					eventId,
					eventSourceUrl: url.href,
					user: {
						email,
						phone: value('phone') || undefined,
						firstName: value('firstName'),
						lastName: value('lastName'),
						city: value('city'),
						state: value('province') || undefined,
						zip: value('postalCode'),
						country,
						clientIpAddress: event.getClientAddress(),
						clientUserAgent: request.headers.get('user-agent') ?? undefined,
						fbp: cookies.get('_fbp'),
						fbc: cookies.get('_fbc') ?? (fbclid ? buildFbc(fbclid, Date.now()) : undefined)
					},
					customData: {
						currency: order.currency,
						value: toAmount(order.totalCents),
						content_type: 'product',
						content_ids: order.items.map((i) => i.sku),
						contents: order.items.map((i) => ({
							id: i.sku,
							quantity: i.quantity,
							item_price: i.unitPriceCents / 100
						})),
						num_items: order.items.reduce((sum, i) => sum + i.quantity, 0)
					}
				});

				// Don't make the customer wait on Meta. Called as a method —
				// destructuring waitUntil loses `this` and throws on Workers.
				const context = platform?.context;
				if (context && typeof context.waitUntil === 'function') {
					context.waitUntil(purchase);
				} else {
					purchase.catch(() => {});
				}
			}
		} catch (error) {
			console.error('Meta Purchase dispatch failed', error);
		}

		return { success: true as const, order, email, eventId };
	}
};
