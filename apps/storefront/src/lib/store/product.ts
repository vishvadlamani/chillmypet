/**
 * The product itself — what the sticky dock restates and what the buy box reads.
 *
 * Price lives here, not in the manifest. The dock and the buy box both show it,
 * and two literals in two blocks is how a page ends up quoting two prices.
 *
 * Prices are pre-formatted strings by contract: currency and locale are the
 * host's business, not the block's.
 */
import type { Commerce } from 'ecomwithai';
import { formatMoney, type Locale } from '$lib/i18n';

export interface Product {
	title: string;
	/** The chosen variant, as a visitor would read it back. */
	variant: string;
	price: string;
	compareAt: string;
	image: string;
	alt: string;
}

export const PRODUCT_SLUG = 'dog-life-jacket';

export async function loadProduct(
	commerce: Commerce,
	locale: Locale,
	slug: string = PRODUCT_SLUG
): Promise<Product | null> {
	const product = await commerce.catalog.getProduct(slug, locale);
	if (!product) return null;

	// Positional options: this catalogue is Colour then Size. The default the
	// page opens on is the first colour and the first size that is actually
	// buyable in it — the same rule the buy box uses, so the dock never quotes a
	// combination the picker won't select.
	const colour = product.options[0]?.values[0];
	const sizes = product.options[1]?.values ?? [];
	const stocked = (size: string) =>
		(product.variants.find((v) => v.options[0] === colour?.value && v.options[1] === size)
			?.stock ?? 0) > 0;
	const size = sizes.find((s) => stocked(s.value))?.label ?? sizes[0]?.label ?? '';

	const hero =
		product.media.find((m) => m.optionValue === colour?.value)?.url ??
		product.media[0]?.url ??
		'/product-floatly.webp';

	return {
		title: product.title,
		variant: [colour?.label, size].filter(Boolean).join(' / '),
		price: formatMoney(product.priceCents, locale, product.currency),
		compareAt: product.compareAtCents
			? formatMoney(product.compareAtCents, locale, product.currency)
			: '',
		image: hero,
		alt: product.title
	};
}
