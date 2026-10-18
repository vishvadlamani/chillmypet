import { loadCollection, treeChrome } from '$lib/store/collection';
import type { PageServerLoad } from './$types';

/**
 * `/christmas`: one page every Christmas ad can share, listing the products
 * `pages.ts` flags `christmas` and linking to each one's own page. Under
 * Catalog in the header's menu.
 */
export const load: PageServerLoad = async ({ locals }) => ({
	...treeChrome(locals.settings),
	// Keeps the Christmas pine and cream, not the brand skin (`+layout.svelte`).
	festive: true,
	products: await loadCollection(locals.commerce, locals.locale, (page) => Boolean(page.christmas))
});
