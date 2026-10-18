import { loadCollection, treeChrome } from '$lib/store/collection';
import type { PageServerLoad } from './$types';

/** The home page is the shop's front window: every listed product as a card. */
export const load: PageServerLoad = async ({ locals }) => {
	const products = await loadCollection(locals.commerce, locals.locale);
	return { ...treeChrome(locals.settings), products };
};
