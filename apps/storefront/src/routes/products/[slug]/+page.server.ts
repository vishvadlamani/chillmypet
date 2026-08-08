import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const product = await locals.commerce.catalog.getProduct(params.slug, locals.locale);
	if (!product) error(404, `No product at "${params.slug}"`);

	return { product };
};
