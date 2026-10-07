import type { FunnelDefinition } from '@funnel/core';
import { HOODIE_PAGE, HOODIE_SLUG } from './hoodie-manifest';
import { STORE_PAGE } from './manifest';
import { PRODUCT_SLUG } from './product';

export interface ProductPage {
	manifest: FunnelDefinition;
	/**
	 * Whether the buyer chooses the size. Off for the life jacket, where the
	 * host picks the first size in stock; on for anything worn by a person, whose
	 * size nobody else can guess.
	 */
	pickSize: boolean;
}

/**
 * Which manifest renders which product.
 *
 * A manifest is per-product, not generic: the FAQ answers, the gallery and the
 * size chart in `STORE_PAGE` are this life jacket's. A second product gets its
 * own entry here rather than inheriting copy about something else — which is
 * why an unmapped slug is a 404 even when the product exists.
 */
export const PRODUCT_PAGES: Record<string, ProductPage> = {
	[PRODUCT_SLUG]: { manifest: STORE_PAGE, pickSize: false },
	[HOODIE_SLUG]: { manifest: HOODIE_PAGE, pickSize: true }
};
