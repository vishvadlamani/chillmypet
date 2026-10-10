import { DR_BLOCKS } from '@funnel/blocks-dr';
import type { PageComponentMap } from '@funnel/core/svelte';
import BenefitCards from '$lib/blocks/BenefitCards.svelte';
import DesignGallery from '$lib/blocks/DesignGallery.svelte';
import DesignSizePicker from '$lib/blocks/DesignSizePicker.svelte';
import SizeGuide from '$lib/blocks/SizeGuide.svelte';

/**
 * The block registry the product pages render with: the library, plus the
 * storefront's own blocks.
 *
 * New block types live here, not in `packages/blocks-dr`. That package is a
 * copy, and an edit there drifts from upstream without anyone noticing. The
 * keys below are new names, not overrides, so a page whose manifest doesn't
 * use them (the life jacket) renders exactly as it did.
 */
export const STORE_BLOCKS: PageComponentMap = {
	...DR_BLOCKS,
	benefit_cards: { render: BenefitCards },
	design_gallery: { render: DesignGallery },
	design_size_picker: { render: DesignSizePicker },
	size_guide: { render: SizeGuide }
};
