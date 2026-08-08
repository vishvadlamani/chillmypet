import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const products = await locals.commerce.catalog.listProducts({
		locale: locals.locale,
		limit: 1
	});
	const hero = products[0]
		? await locals.commerce.catalog.getProduct(products[0].slug, locals.locale)
		: null;

	return { hero };
};
