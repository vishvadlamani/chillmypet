import type { FunnelDefinition } from '@funnel/core';
import { STORE_PAGE } from './manifest';
import { PRODUCT_SLUG } from './product';

/**
 * Which manifest renders which product.
 *
 * A manifest is per-product, not generic: the FAQ answers, the gallery and the
 * size chart in `STORE_PAGE` are this life jacket's. A second product gets its
 * own entry here rather than inheriting copy about something else — which is
 * why an unmapped slug is a 404 even when the product exists.
 */
export const PRODUCT_PAGES: Record<string, FunnelDefinition> = {
	[PRODUCT_SLUG]: STORE_PAGE
};
