import { loadCollection, treeChrome } from '$lib/store/collection';
import type { PageServerLoad } from './$types';

/** `/catalog`: everything the shop lists, the header's Catalog → All products. */
export const load: PageServerLoad = async ({ locals }) => ({
	...treeChrome(locals.settings),
	products: await loadCollection(locals.commerce, locals.locale)
});
