import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		locale: locals.locale,
		// The id the base snippet fired this page's PageView with. The layout
		// posts the Conversions API half under the same id, so Meta counts one
		// page view instead of a browser one and a server one.
		pageViewEventId: locals.pageViewEventId
	};
};
