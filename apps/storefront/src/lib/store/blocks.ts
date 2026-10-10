import { DR_BLOCKS } from '@funnel/blocks-dr';
import type { PageComponentMap } from '@funnel/core/svelte';
import PaymentIcons from '$lib/components/PaymentIcons.svelte';
import BenefitCards from '$lib/blocks/BenefitCards.svelte';
import DesignGallery from '$lib/blocks/DesignGallery.svelte';
import DesignSizePicker from '$lib/blocks/DesignSizePicker.svelte';
import SizeGuide from '$lib/blocks/SizeGuide.svelte';

/**
 * The block registry the product pages render with: the library, plus the
 * storefront's own blocks.
 *
 * New block types live here, not in `packages/blocks-dr`. That package is a
 * copy, and an edit there drifts from upstream without anyone noticing. Most
 * keys below are new names, so a page whose manifest doesn't use them (the
 * life jacket) renders exactly as it did. `payment_badges` is the exception: it
 * takes over the library's key, which is the library's own contract for a
 * host renderer — the host wins on a collision.
 */
export const STORE_BLOCKS: PageComponentMap = {
	...DR_BLOCKS,
	payment_badges: { render: PaymentIcons },
	benefit_cards: { render: BenefitCards },
	design_gallery: { render: DesignGallery },
	design_size_picker: { render: DesignSizePicker },
	size_guide: { render: SizeGuide }
};
