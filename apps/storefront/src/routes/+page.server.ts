import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Every active product, not the first one. The homepage was a single-product
	// hero because the store sold one thing; `limit: 1` on a two-product
	// catalogue is not a smaller list, it is a product nobody can reach from the
	// front page.
	const products = await locals.commerce.catalog.listProducts({ locale: locals.locale });
	const hero = products[0]
		? await locals.commerce.catalog.getProduct(products[0].slug, locals.locale)
		: null;

	return { hero, products };
};
