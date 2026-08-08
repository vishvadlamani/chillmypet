import { fail } from '@sveltejs/kit';
import { CheckoutError, createOrder, isShippingMethod } from '$lib/server/orders';
import type { Actions } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED = [
	'firstName',
	'lastName',
	'address1',
	'city',
	'postalCode',
	'country'
] as const;

type RequiredField = (typeof REQUIRED)[number];

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const value = (name: string) => String(form.get(name) ?? '').trim();

		const email = value('email');
		const fieldErrors: Partial<Record<RequiredField | 'email' | 'cart', string>> = {};

		if (!EMAIL.test(email)) fieldErrors.email = 'emailInvalid';
		for (const field of REQUIRED) {
			if (!value(field)) fieldErrors[field] = 'fieldRequired';
		}

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
		const method = isShippingMethod(methodInput) ? methodInput : 'standard';

		try {
			const order = await createOrder({
				lines,
				method,
				locale: locals.locale,
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
					country: value('country')
				}
			});

			return { success: true as const, order, email };
		} catch (error) {
			if (error instanceof CheckoutError) {
				return fail(409, { errorCode: error.code, detail: error.detail ?? null });
			}
			console.error('checkout failed', error);
			return fail(500, { errorCode: 'generic' as const, detail: null });
		}
	}
};
