import { DR_BLOCKS } from '@funnel/blocks-dr';
import type { PageComponentMap } from '@funnel/core/svelte';
import PaymentIcons from '$lib/components/PaymentIcons.svelte';

/**
 * The block registry every storefront page renders with: the library, plus
 * storefront renderers that take over a library key. The host's keys win on a
 * collision, which is the library's own contract for this.
 *
 * Overriding here is how we change how a block looks without editing
 * `packages/blocks-dr`. That package is a copy, and an edit there drifts from
 * upstream without anyone noticing.
 */
export const STORE_BLOCKS: PageComponentMap = {
	...DR_BLOCKS,
	payment_badges: { render: PaymentIcons }
};
