import { json, type RequestHandler } from '@sveltejs/kit';
import { priceVariants } from '$lib/server/catalog';

/**
 * Re-prices a client cart against the database. The browser stores prices for
 * display, but they are advisory — this endpoint (and the checkout action) are
 * the only sources of truth.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ lines: [], subtotalCents: 0, currency: 'USD' });
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

	const priced = await priceVariants(wanted.map((l) => l.variantId));

	const lines = wanted.flatMap((line) => {
		const variant = priced.get(line.variantId);
		if (!variant) return [];
		return [
			{
				variantId: variant.variantId,
				slug: variant.productSlug,
				colour: variant.colour,
				size: variant.size,
				sku: variant.sku,
				unitPriceCents: variant.unitPriceCents,
				quantity: line.quantity,
				stock: variant.stock
			}
		];
	});

	const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
	const currency = lines[0] ? priced.get(lines[0].variantId)!.currency : 'USD';

	return json({ lines, subtotalCents, currency });
};
