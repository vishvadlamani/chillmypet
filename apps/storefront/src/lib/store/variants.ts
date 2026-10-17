/**
 * What the design and size pickers offer, and which variant each pair buys.
 *
 * For a garment the size is the buyer's to make: there is no safe default, and
 * picking one for them ships every order in S. So unlike the life jacket, whose
 * host chooses the first size in stock, this page sends both choices and the
 * host refuses to add anything until both are made.
 *
 * The picker's options and the host's lookup both come from here, matched by
 * option CODE, so renaming a design's label can never send an order to the
 * fallback variant.
 */
import type { Product } from 'ecomwithai';
import { formatMoney, type Locale } from '$lib/i18n';

export interface DesignChoice {
	code: string;
	label: string;
	swatch?: string;
	image?: string;
	alt?: string;
}

export interface SizeChoice {
	code: string;
	label: string;
}

/** One buyable combination: the host's lookup, never shown to a block. */
export interface VariantEntry {
	colour: string;
	colourCode: string;
	size: string;
	variantId: number;
	unitPriceCents: number;
	sku: string;
}

export interface VariantPicker {
	designs: DesignChoice[];
	sizes: SizeChoice[];
	/** `design:size` pairs in stock — the picker greys out the rest. */
	available: string[];
	price: string;
}

/** Every buyable design × size, positional: options[0] design, options[1] size. */
export function variantEntries(product: Product): VariantEntry[] {
	const designs = product.options[0]?.values ?? [];
	return product.variants.flatMap((v) => {
		const design = designs.find((d) => d.value === v.options[0]);
		if (!design || !v.options[1] || v.stock <= 0) return [];
		return [
			{
				colour: design.label ?? design.value,
				colourCode: design.value,
				size: v.options[1],
				variantId: v.id,
				unitPriceCents: v.priceCents,
				sku: v.sku
			}
		];
	});
}

export function loadVariantPicker(product: Product, locale: Locale): VariantPicker {
	const entries = variantEntries(product);
	return {
		designs: (product.options[0]?.values ?? []).map((d) => {
			const photo = product.media.find((m) => m.optionValue === d.value);
			return {
				code: d.value,
				label: d.label ?? d.value,
				swatch: d.swatchHex ?? undefined,
				image: photo?.url,
				alt: photo?.alt ?? undefined
			};
		}),
		sizes: (product.options[1]?.values ?? []).map((s) => ({
			code: s.value,
			label: s.label ?? s.value
		})),
		available: entries.map((e) => `${e.colourCode}:${e.size}`),
		price: formatMoney(product.priceCents, locale, product.currency)
	};
}
