import type { FunnelDefinition } from '@funnel/core';
import { CHRISTMAS_COSTUME_PAGE } from './christmas-costume-manifest';
import { CHRISTMAS_HOODIE_PAGE } from './christmas-hoodie-manifest';
import { STORE_PAGE } from './manifest';
import { PRODUCT_SLUG } from './product';

export interface ProductPage {
	manifest: FunnelDefinition;
	/**
	 * Whether the buyer chooses the size. Off for the life jacket, where the
	 * host picks the first size in stock in the chosen colour; on for anything
	 * sized for a wearer the host cannot guess — a person, or a particular dog.
	 */
	pickSize: boolean;
	/** A seasonal skin layered over the brand, scoped to this page only. */
	theme?: 'christmas';
}

/** Kept in step with `scripts/christmas-hoodie.js`. */
export const CHRISTMAS_HOODIE_SLUG = 'christmas-pouch-hoodie';
/** Kept in step with `scripts/dog-christmas-costume.js`. */
export const DOG_CHRISTMAS_COSTUME_SLUG = 'dog-christmas-costume';

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
	[CHRISTMAS_HOODIE_SLUG]: { manifest: CHRISTMAS_HOODIE_PAGE, pickSize: true, theme: 'christmas' },
	[DOG_CHRISTMAS_COSTUME_SLUG]: {
		manifest: CHRISTMAS_COSTUME_PAGE,
		pickSize: true,
		theme: 'christmas'
	}
};
