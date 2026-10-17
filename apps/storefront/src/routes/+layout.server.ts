import { loadChristmasDelivery } from '$lib/store/christmas';
import { PRODUCT_PAGES } from '$lib/store/pages';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// The header is Home, Catalog and Contact; Catalog opens onto All
	// products and, once it has a product to show, Christmas. Read from the
	// catalogue rather than typed here, by the collections' own rule (a row
	// AND a manifest, not `unlisted`), so the menu never offers an empty or
	// dead collection.
	const products = await locals.commerce.catalog.listProducts({
		locale: locals.locale,
		limit: 50
	});

	return {
		locale: locals.locale,
		// The strip the tree chrome lifts above the header on a page that
		// brings none of its own; empty once the Christmas cut-off has passed.
		siteAnnouncement: loadChristmasDelivery(locals.settings).message ?? '',
		christmasShop: products.some((p) => {
			const entry = PRODUCT_PAGES[p.slug];
			return entry?.christmas && !entry.unlisted;
		})
	};
};
