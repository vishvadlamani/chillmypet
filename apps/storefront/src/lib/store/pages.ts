import type { FunnelDefinition } from '@funnel/core';
import { CHRISTMAS_COSTUME_PAGE } from './christmas-costume-manifest';
import { STORE_PAGE } from './manifest';
import { PRODUCT_SLUG } from './product';
import { CHRISTMAS_PET_HOODIE_PAGE } from './christmas-pet-hoodie-manifest';
import { RETIRED_PRODUCTS } from '../../../scripts/retired-products.js';
import { SLUG_CHANGES } from '../../../scripts/slug-changes.js';
import { SANTA_COSTUME_PAGE } from './santa-costume-manifest';

export interface ProductPage {
	manifest: FunnelDefinition;
	/**
	 * Whether the buyer chooses the size. Off for the life jacket, where the
	 * host picks the first size in stock in the chosen colour; on for anything
	 * sized for a wearer the host cannot guess — a person, or a particular dog.
	 */
	pickSize: boolean;
	/**
	 * A skin scoped to this page only: `tree` is the shop's quiet
	 * cream-and-pine look (see `$lib/styles/tree-theme.css`), with the
	 * Christmas delivery strip.
	 */
	theme?: 'tree';
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
	 * The colour the page opens on, when it should not be the catalogue's
	 * first. Its photo leads the gallery and the picker starts on it; with
	 * `cardImage` set, that photo is also the listing image (cards, sticky
	 * bar, bundle cards, link previews).
	 */
	leadDesign?: string;
	/**
	 * How `/products/<slug>/checkout` is laid out. Unset, it is the product
	 * page's top over the checkout's fields. `shop` is a dedicated checkout
	 * page in the shape shoppers know from hosted shop checkouts: contact,
	 * delivery, shipping method and payment in one column, the order summary
	 * beside it (folded into a bar on a phone), and the picker reduced to a
	 * line once a design and size are chosen. It is where the product page's
	 * own Add to cart goes (with the design and size in the link) instead of
	 * `/checkout`; see `$lib/store/one-page-checkout.ts`.
	 */
	checkout?: 'shop';
}

/** Kept in step with `scripts/pet-christmas-costume.js`. */
export const PET_CHRISTMAS_COSTUME_SLUG = 'pet-christmas-costume';
/** Kept in step with `scripts/christmas-pet-hoodie.js`. */
export const CHRISTMAS_PET_HOODIE_SLUG = 'christmas-pet-hoodie';
/** Kept in step with `scripts/pet-santa-costume.js`. */
export const PET_SANTA_COSTUME_SLUG = 'pet-santa-costume';

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
	[PET_CHRISTMAS_COSTUME_SLUG]: {
		manifest: CHRISTMAS_COSTUME_PAGE,
		pickSize: true,
		theme: 'tree',
		christmas: true,
		// The tabby in the green costume leads, on the owner's instruction of
		// 2026-10-17: the product is for pets, not only dogs.
		leadDesign: 'green',
		cardImage: '/products/dog-christmas-costume/cat.jpg',
		// The Christmas costume ad links to the product page; its Add to cart
		// opens a payment page of its own, not the product page again (the
		// owner's call, 2026-10-17).
		checkout: 'shop'
	},
	[CHRISTMAS_PET_HOODIE_SLUG]: {
		manifest: CHRISTMAS_PET_HOODIE_PAGE,
		pickSize: true,
		theme: 'tree',
		christmas: true
	},
	[PET_SANTA_COSTUME_SLUG]: {
		manifest: SANTA_COSTUME_PAGE,
		pickSize: true,
		theme: 'tree',
		christmas: true
	}
};

/**
 * The product a retired product's links go to (`scripts/retired-products.js`):
 * its page and its checkout both redirect there, never to a 404, so an old
 * ad, bookmark or landing page link still reaches something on sale.
 */
const MOVED_TO: Record<string, string> = Object.fromEntries(
	RETIRED_PRODUCTS.map(({ slug, movedTo }) => [slug, movedTo])
);

/** Choices that named the retired product's own designs and sizes. */
const ITS_OWN_CHOICES = ['design', 'size', 'added'];

/**
 * Where `/products/<slug>` (or its checkout) should send the visitor, or
 * null when the slug is not retired. The query string goes along, so an ad
 * click's `fbclid` and utm tags still reach the pixel, less the choices that
 * named the old product's options.
 */
export function retiredRedirect(slug: string, url: URL): string | null {
	const target = MOVED_TO[slug];
	if (!target) return null;
	const query = new URLSearchParams(url.search);
	for (const key of ITS_OWN_CHOICES) query.delete(key);
	const search = query.toString();
	return `/products/${target}${search ? `?${search}` : ''}`;
}

const RENAMED_TO: Record<string, string> = Object.fromEntries(SLUG_CHANGES.map(({ from, to }) => [from, to]));

/**
 * Where a renamed product's old URL goes (`scripts/slug-changes.js`), or null
 * when the slug was never renamed. Same product, same sizes: the page and its
 * checkout keep their place and the whole query string, so an ad's `fbclid`,
 * its utm tags and a chosen design and size all arrive.
 */
export function renamedRedirect(slug: string, url: URL): string | null {
	const target = RENAMED_TO[slug];
	if (!target) return null;
	return url.pathname.replace(`/products/${slug}`, `/products/${target}`) + url.search;
}
