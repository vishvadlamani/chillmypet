import { json, type RequestHandler } from '@sveltejs/kit';
import { applyQuantityBreak } from 'ecomwithai';

/**
 * Re-prices a client cart against the database. The browser stores prices for
 * display, but they are advisory — this endpoint (and the checkout action) are
 * the only sources of truth.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ lines: [], subtotalCents: 0, currency: locals.store.currency });
	}

	const requested = Array.isArray((body as { lines?: unknown })?.lines)
		? ((body as { lines: unknown[] }).lines as Record<string, unknown>[])
		: [];

	const wanted = requested
		.map((line) => ({
			variantId: Number(line.variantId),
			quantity: Math.max(1, Math.min(10, Number(line.quantity) || 1))
		}))
		.filter((line) => Number.isInteger(line.variantId) && line.variantId > 0);

	const priced = await locals.commerce.catalog.priceVariants(wanted.map((l) => l.variantId));

	const lines = wanted.flatMap((line) => {
		const variant = priced.get(line.variantId);
		if (!variant) return [];
		return [
			{
				variantId: variant.variantId,
				slug: variant.productSlug,
				title: variant.title,
				// Positional option values: [colour, size] for this catalogue.
				colour: variant.options[0] ?? '',
				size: variant.options[1] ?? '',
				sku: variant.sku,
				unitPriceCents: variant.unitPriceCents,
				quantity: line.quantity,
				stock: variant.stock
			}
		];
	});

	const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
	// Same tiers, same arithmetic as the order, so the total the customer reads
	// is the total they are charged.
	const units = lines.reduce((sum, l) => sum + l.quantity, 0);
	const bundle = applyQuantityBreak(locals.commerce.quantityBreaks, subtotalCents, units);
	const currency = lines[0]
		? priced.get(lines[0].variantId)!.currency
		: locals.store.currency;

	return json({
		lines,
		subtotalCents,
		discountCents: bundle.discountCents,
		totalCents: bundle.totalCents,
		bundlePercentOff: bundle.applied?.percentOff ?? 0,
		currency
	});
};
