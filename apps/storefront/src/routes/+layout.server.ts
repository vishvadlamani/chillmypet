import { PRODUCT_PAGES } from '$lib/store/pages';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// What the header links to. A product is reachable only when it has BOTH a
	// row in this store and a manifest in pages.ts — a row alone is a 404, and
	// so is a manifest alone — so the header lists the products that have both,
	// read from the catalogue rather than typed here. A hardcoded "Shop" link
	// to one product is how the Christmas hoodie spent its first days reachable
	// only by someone who already knew the URL, and how a product missing from
	// the live database would get a dead link instead of no link.
	const products = await locals.commerce.catalog.listProducts({
		locale: locals.locale,
		limit: 10
	});

	const linked = products.filter((p) => Object.hasOwn(PRODUCT_PAGES, p.slug));
	return {
		locale: locals.locale,
		nav: linked.map((p) => ({ slug: p.slug, title: p.title })),
		// `/christmas` by the same rule: linked once it has a product to show.
		christmasShop: linked.some((p) => PRODUCT_PAGES[p.slug].christmas)
	};
};
