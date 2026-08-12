import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const product = await locals.commerce.catalog.getProduct(params.slug, locals.locale);
	if (!product) error(404, `No product at "${params.slug}"`);

	// Tiers are sent for rendering only. The discount itself is recomputed by
	// the order from the quantity the server counts, so a browser that edits
	// these buys nothing.
	return { product, quantityBreaks: locals.commerce.quantityBreaks };
};
