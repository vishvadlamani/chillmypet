import { redirect } from '@sveltejs/kit';
import { PRODUCT_SLUG } from '$lib/store/product';
import type { PageServerLoad } from './$types';

/**
 * `/store` was where these pages were built before they replaced the real ones.
 * Anything already pointing here — a bookmark, a shared link, an ad that was
 * set up early — goes to the page that now serves them. The query string goes
 * with it: an ad's `fbclid` dropped here is a click Meta can never attribute.
 */
export const load: PageServerLoad = ({ url }) => {
	redirect(308, `/products/${PRODUCT_SLUG}${url.search}`);
};
