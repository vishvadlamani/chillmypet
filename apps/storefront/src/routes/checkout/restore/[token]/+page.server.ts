import type { PageServerLoad } from './$types';

/**
 * Where a reminder email's "Finish my order" button lands. Reads the draft and
 * hands its lines back in the cart's own shape; the page writes them into the
 * cart and goes on to the checkout, which re-prices them as always.
 *
 * Read-only: mail scanners open this link before the shopper does, and all
 * they get is the same redirect.
 */
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });

	const draft = await locals.commerce.recovery.byToken(params.token);
	if (!draft) return { lines: [], email: '', firstName: '' };

	const priced = await locals.commerce.catalog.priceVariants(draft.lines.map((l) => l.variantId));
	const lines = draft.lines.flatMap((line) => {
		const variant = priced.get(line.variantId);
		if (!variant) return [];
		return [
			{
				variantId: variant.variantId,
				slug: variant.productSlug,
				// Positional option values: [colour, size] for this catalogue, as in /api/cart.
				colour: variant.options[0] ?? '',
				size: variant.options[1] ?? '',
				quantity: line.quantity,
				unitPriceCents: variant.unitPriceCents
			}
		];
	});

	return { lines, email: draft.email, firstName: draft.firstName ?? '' };
};
