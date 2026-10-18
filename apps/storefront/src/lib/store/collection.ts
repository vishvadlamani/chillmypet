import type { Commerce } from 'ecomwithai';
import { formatMoney, type Locale } from '$lib/i18n';
import { loadChristmasDelivery } from './christmas';
import { PRODUCT_PAGES, type ProductPage } from './pages';

/** One product as a collection card shows it: photo, words, price, choices. */
export interface ProductCard {
	slug: string;
	title: string;
	subtitle: string;
	image: string | null;
	alt: string;
	price: string;
	colours: { label: string; hex: string | null | undefined }[];
	sizes: string;
	inStock: boolean;
	/** Whether the product page asks for a size, which is what the card offers. */
	pickSize: boolean;
	/** How the photo sits in the card's frame (`cardFit` in `pages.ts`). */
	fit: 'cover' | 'contain';
}

/**
 * The cards for a collection page (`/`, `/catalog`, `/christmas`).
 *
 * Only products with BOTH a row in this store and a manifest in `pages.ts`,
 * the header's old rule, so a card can never lead to a 404; and never an
 * `unlisted` one. `include` narrows further (the Christmas flag, say). The
 * Christmas products come first while there are any, then the catalogue's
 * order (`position`) within each group.
 *
 * Deliberately no buying on a collection. AddToCart, the size choice and the
 * bundle cards stay on the product pages, so every conversion event keeps the
 * one path the tests pin; a collection only gets the shopper to the right page.
 */
export async function loadCollection(
	commerce: Commerce,
	locale: Locale,
	include: (page: ProductPage) => boolean = () => true
): Promise<ProductCard[]> {
	const listed = await commerce.catalog.listProducts({ locale, limit: 50 });
	const slugs = listed
		.filter((p) => {
			const entry = PRODUCT_PAGES[p.slug];
			return entry && !entry.unlisted && include(entry);
		})
		.map((p) => p.slug);
	const seasonal = (slug: string) => (PRODUCT_PAGES[slug].christmas ? 0 : 1);
	slugs.sort((a, b) => seasonal(a) - seasonal(b));
	const products = (
		await Promise.all(slugs.map((slug) => commerce.catalog.getProduct(slug, locale)))
	).filter((p) => p !== null);

	return products.map((p) => {
		const colours = p.options[0]?.values ?? [];
		const sizes = p.options[1]?.values ?? [];
		const lead = p.media[0];
		return {
			slug: p.slug,
			title: p.title,
			subtitle: p.subtitle ?? '',
			image: PRODUCT_PAGES[p.slug].cardImage ?? lead?.url ?? null,
			alt: lead?.alt ?? p.title,
			// Lowest variant price. Every listed product today has one price
			// across its variants; if that changes, the card should say "from".
			price: formatMoney(p.priceCents, locale, p.currency),
			colours: colours.map((c) => ({ label: c.label ?? c.value, hex: c.swatchHex })),
			sizes:
				sizes.length > 1
					? `${sizes[0].label ?? sizes[0].value}–${sizes.at(-1)!.label ?? sizes.at(-1)!.value}`
					: (sizes[0]?.label ?? ''),
			inStock: p.variants.some((v) => v.stock > 0),
			pickSize: PRODUCT_PAGES[p.slug].pickSize,
			fit: PRODUCT_PAGES[p.slug].cardFit ?? 'cover'
		};
	});
}

/**
 * The shop's own pages (home, catalogue, collections, contact) wear the tree
 * storefront's chrome, so the shop reads as one place from the menu to the
 * product page. They have no manifest, so the delivery strip the layout lifts
 * above the header is handed over as `announcement`; once the cut-off has
 * passed it is empty and the strip drops out.
 */
export function treeChrome(settings: Record<string, string>) {
	return {
		theme: 'tree' as const,
		announcement: loadChristmasDelivery(settings).message ?? ''
	};
}
