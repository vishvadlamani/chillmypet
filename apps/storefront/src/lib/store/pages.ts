import type { FunnelDefinition } from '@funnel/core';
import { CHRISTMAS_COSTUME_PAGE } from './christmas-costume-manifest';
import { CHRISTMAS_HOODIE_PAGE } from './christmas-hoodie-manifest';
import { STORE_PAGE } from './manifest';
import { PRODUCT_SLUG } from './product';
import { REINDEER_HOODIE_PAGE } from './reindeer-hoodie-manifest';

export interface ProductPage {
	manifest: FunnelDefinition;
	/**
	 * Whether the buyer chooses the size. Off for the life jacket, where the
	 * host picks the first size in stock in the chosen colour; on for anything
	 * sized for a wearer the host cannot guess — a person, or a particular dog.
	 */
	pickSize: boolean;
	/**
	 * A skin scoped to this page only. `christmas` is the hoodie's festive
	 * layer over the brand; `tree` is the costume's quiet cream-and-pine
	 * storefront look (see `$lib/styles/tree-theme.css`). Both carry the
	 * Christmas delivery strip.
	 */
	theme?: 'christmas' | 'tree';
	/**
	 * Listed on `/christmas`, the page the Christmas ads can share. In this
	 * map's order, so the first entry is the collection's lead product.
	 */
	christmas?: boolean;
	/**
	 * Left out of the header's menu, `/catalog` and the home page. The page,
	 * its checkout and everything that links to it straight (an ad, a landing
	 * page's Buy now) keep working: this only stops the shop's own navigation
	 * from offering it.
	 */
	unlisted?: boolean;
	/**
	 * The photo a collection card shows, when it should not be the catalogue's
	 * lead photo: the life jacket's is a cut-out on pure white, which sat as a
	 * white tile among the cream studio shots. A treatment of the same photo,
	 * not a different product shot.
	 */
	cardImage?: string;
	/**
	 * `contain` shows the whole card photo inside the frame instead of
	 * cropping it to fill: for a side-on studio shot (the life jacket's), whose
	 * dog lost its nose and tail to the crop in a phone's narrow card.
	 */
	cardFit?: 'cover' | 'contain';
	/**
	 * How `/products/<slug>/checkout` is laid out. Unset, it is the product
	 * page's top over the checkout's fields. `shop` is a dedicated checkout
	 * page in the shape shoppers know from hosted shop checkouts: contact,
	 * delivery, shipping method and payment in one column, the order summary
	 * beside it (folded into a bar on a phone), and the picker reduced to a
	 * line once a design and size are chosen. It is where the Christmas
	 * landing page sends its Buy button; see `$lib/store/one-page-checkout.ts`.
	 */
	checkout?: 'shop';
}

/** Kept in step with `scripts/christmas-hoodie.js`. */
export const CHRISTMAS_HOODIE_SLUG = 'christmas-pouch-hoodie';
/** Kept in step with `scripts/dog-christmas-costume.js`. */
export const DOG_CHRISTMAS_COSTUME_SLUG = 'dog-christmas-costume';
/** Kept in step with `scripts/reindeer-dog-hoodie.js`. */
export const REINDEER_DOG_HOODIE_SLUG = 'reindeer-dog-hoodie';

/**
 * Which manifest renders which product.
 *
 * A manifest is per-product, not generic: the FAQ answers, the gallery and the
 * size chart in `STORE_PAGE` are this life jacket's. A second product gets its
 * own entry here rather than inheriting copy about something else — which is
 * why an unmapped slug is a 404 even when the product exists.
 */
export const PRODUCT_PAGES: Record<string, ProductPage> = {
	[PRODUCT_SLUG]: {
		manifest: STORE_PAGE,
		pickSize: false,
		// The shop's look since 2026-10-17, like the Christmas pages.
		theme: 'tree',
		// sailboat.jpg on the warm backdrop of the Christmas studio shots.
		cardImage: '/products/dog-life-jacket/card-sailboat.jpg',
		cardFit: 'contain'
	},
	[CHRISTMAS_HOODIE_SLUG]: {
		manifest: CHRISTMAS_HOODIE_PAGE,
		pickSize: true,
		theme: 'christmas',
		checkout: 'shop',
		// A person's garment in a shop of dog clothes, and the Christmas landing
		// page sells it straight to its own checkout, so the menu leaves it out
		// for now (the owner's call, 2026-10-17). Delete this line to list it.
		unlisted: true
	},
	[DOG_CHRISTMAS_COSTUME_SLUG]: {
		manifest: CHRISTMAS_COSTUME_PAGE,
		pickSize: true,
		theme: 'tree',
		christmas: true
	},
	[REINDEER_DOG_HOODIE_SLUG]: {
		manifest: REINDEER_HOODIE_PAGE,
		pickSize: true,
		theme: 'tree',
		christmas: true
	}
};
