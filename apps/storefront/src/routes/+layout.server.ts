import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		locale: locals.locale,
		// Public by design — it is already in the page's own pixel snippet. The
		// browser needs it by name to report a navigation to this pixel ALONE:
		// pages that carry a second pixel would otherwise count one navigation
		// twice on it.
		metaPixelId: locals.settings.meta_pixel_id ?? ''
	};
};
