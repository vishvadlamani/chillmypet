/**
 * What the bundle picker offers per unit, and which variant each choice buys.
 *
 * The picker's options and the host's lookup both come from here, because they
 * are matched by label: if the two were derived separately, one renamed colour
 * would turn every order into the fallback variant.
 *
 * Two shapes:
 *   - colour only (`pickSize: false`) — the life jacket. The host picks the
 *     size: the first one actually buyable in that colour.
 *   - colour and size (`pickSize: true`) — one choice per buyable combination,
 *     "Lotus / M". For a garment the size is the buyer's to make, and a default
 *     would ship every order in XS.
 */
import type { Product } from 'ecomwithai';

export interface VariantChoice {
	/** Exactly what the picker shows and sends back. */
	label: string;
	colourCode: string;
	size: string;
	variantId: number;
	unitPriceCents: number;
	sku: string;
}

/**
 * First entry in a size-picking dropdown, so nothing is pre-selected. Not a
 * variant: the host refuses to add it and sends the visitor back to choose.
 */
export const CHOOSE_PROMPT = 'Choose colour & size';

export function variantChoices(product: Product, pickSize: boolean): VariantChoice[] {
	// Positional options: this catalogue is Colour then Size.
	const colours = product.options[0]?.values ?? [];
	const sizes = product.options[1]?.values ?? [];
	const variantFor = (colour: string, size: string) =>
		product.variants.find((v) => v.options[0] === colour && v.options[1] === size);

	return colours.flatMap((colour) => {
		const colourLabel = colour.label ?? colour.value;
		const buyable = sizes
			.map((size) => ({ size, variant: variantFor(colour.value, size.value) }))
			.filter(({ variant }) => variant && variant.stock > 0);

		const picked = pickSize ? buyable : buyable.slice(0, 1);
		return picked.map(({ size, variant }) => ({
			label: pickSize ? `${colourLabel} / ${size.label ?? size.value}` : colourLabel,
			colourCode: colour.value,
			size: variant!.options[1] ?? '',
			variantId: variant!.id,
			unitPriceCents: variant!.priceCents,
			sku: variant!.sku
		}));
	});
}
