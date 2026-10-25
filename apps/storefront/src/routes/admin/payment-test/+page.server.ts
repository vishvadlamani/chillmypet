import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PAYMENT_TEST_SLUG } from '$lib/server/payment-test';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.paymentTest) error(404, 'Not found');
	const product = await locals.commerce.catalog.getProduct(PAYMENT_TEST_SLUG);
	const variant = product?.variants[0];
	if (!variant || variant.priceCents !== 100) error(503, 'The $1.00 sandbox item is unavailable.');
	return {
		variantId: variant.id,
		metaReady: Boolean(env.META_CAPI_ACCESS_TOKEN && env.META_CAPI_TEST_EVENT_CODE)
	};
};
