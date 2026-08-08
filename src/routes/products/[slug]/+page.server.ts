import { error } from '@sveltejs/kit';
import { getProduct } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const product = await getProduct(params.slug);
	if (!product) error(404, `No product at "${params.slug}"`);

	return { product };
};
