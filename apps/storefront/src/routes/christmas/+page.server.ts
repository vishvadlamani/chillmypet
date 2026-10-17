import { formatMoney } from '$lib/i18n';
import { loadChristmasDelivery } from '$lib/store/christmas';
import { PRODUCT_PAGES } from '$lib/store/pages';
import type { PageServerLoad } from './$types';

/**
 * `/christmas`: one page every Christmas ad can share, listing the Christmas
 * products and linking to each one's own page.
 *
 * Which products: the ones `pages.ts` flags `christmas`, and only once they
 * have a row in this store — the same both-or-nothing rule as the header, so
 * a card can never lead to a 404. Order is the catalogue's (`position`).
 *
 * Deliberately no buying here. AddToCart, the size choice and the bundle
 * cards stay on the product pages, so every conversion event keeps the one
 * path the tests pin; this page only gets the shopper to the right one.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { commerce, locale, settings } = locals;

	const listed = await commerce.catalog.listProducts({ locale, limit: 50 });
	const slugs = listed.filter((p) => PRODUCT_PAGES[p.slug]?.christmas).map((p) => p.slug);
	const products = (
		await Promise.all(slugs.map((slug) => commerce.catalog.getProduct(slug, locale)))
	).filter((p) => p !== null);

	return {
		// The tree storefront's chrome, and its strip lifted above the header.
		theme: 'tree' as const,
		announcement: loadChristmasDelivery(settings).message ?? '',
		products: products.map((p) => {
			const colours = p.options[0]?.values ?? [];
			const sizes = p.options[1]?.values ?? [];
			const lead = p.media[0];
			return {
				slug: p.slug,
				title: p.title,
				subtitle: p.subtitle ?? '',
				image: lead?.url ?? null,
				alt: lead?.alt ?? p.title,
				// Lowest variant price. Every Christmas product today has one price
				// across its variants; if that changes, the card should say "from".
				price: formatMoney(p.priceCents, locale, p.currency),
				colours: colours.map((c) => ({ label: c.label ?? c.value, hex: c.swatchHex })),
				sizes:
					sizes.length > 1
						? `${sizes[0].label ?? sizes[0].value}–${sizes.at(-1)!.label ?? sizes.at(-1)!.value}`
						: (sizes[0]?.label ?? ''),
				inStock: p.variants.some((v) => v.stock > 0)
			};
		})
	};
};
