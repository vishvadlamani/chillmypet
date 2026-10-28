/**
 * Quantity-break pricing: buy more of the same product, pay less per unit.
 *
 * The tiers are store configuration, not framework policy — a host app supplies
 * its own table. What the framework owns is that the discount is **derived from
 * the quantity the server counted**, never from anything a client sent. A
 * bundle discount posted as a number in a form is a free-money bug.
 */
export type QuantityBreak = {
	/** Applies once the order holds at least this many units. */
	minQuantity: number;
	/** Whole percent off the subtotal, 1–100. */
	percentOff: number;
};

export type AppliedBreak = {
	/** The tier that won, or null when no tier applies. */
	applied: QuantityBreak | null;
	discountCents: number;
	/** Subtotal after the discount. Never below zero, never above the subtotal. */
	totalCents: number;
};

/**
 * Highest tier whose threshold the quantity meets. Sorted here rather than
 * trusting caller order, because a table written out of order would otherwise
 * silently apply the wrong discount.
 */
export function resolveQuantityBreak(
	breaks: QuantityBreak[],
	totalUnits: number
): QuantityBreak | null {
	if (!Number.isFinite(totalUnits) || totalUnits < 1) return null;
	const eligible = breaks
		.filter(
			(b) =>
				Number.isFinite(b.minQuantity) &&
				Number.isFinite(b.percentOff) &&
				b.percentOff > 0 &&
				b.percentOff <= 100 &&
				totalUnits >= b.minQuantity
		)
		.sort((a, b) => b.minQuantity - a.minQuantity);
	return eligible[0] ?? null;
}

/**
 * Rounds the discount, not the total, so the two always add back to the
 * subtotal exactly. Rounding the total instead leaves an order whose lines do
 * not sum to what was charged, which surfaces later as a webhook amount
 * mismatch that is very hard to read.
 */
export function applyQuantityBreak(
	breaks: QuantityBreak[],
	subtotalCents: number,
	totalUnits: number
): AppliedBreak {
	const applied = resolveQuantityBreak(breaks, totalUnits);
	if (!applied || subtotalCents <= 0) {
		return { applied: null, discountCents: 0, totalCents: Math.max(0, subtotalCents) };
	}
	const discountCents = Math.min(
		subtotalCents,
		Math.round((subtotalCents * applied.percentOff) / 100)
	);
	return { applied, discountCents, totalCents: subtotalCents - discountCents };
}

/** A server-priced line; eligibility never comes from a browser's claim. */
export type DiscountLine = { productSlug: string; unitPriceCents: number; quantity: number };

/** BOGO products are excluded from quantity breaks, so promotions never stack. */
export function applyCartDiscounts(breaks: QuantityBreak[], lines: DiscountLine[], bogoProducts: string[] = []) {
	const eligible = new Set(bogoProducts);
	const regular = lines.filter((line) => !eligible.has(line.productSlug));
	const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
	const bundle = applyQuantityBreak(breaks,
		regular.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0),
		regular.reduce((sum, line) => sum + line.quantity, 0));
	let bogoDiscountCents = 0;
	for (const slug of eligible) {
		const productLines = lines.filter((line) => line.productSlug === slug)
			.sort((a, b) => a.unitPriceCents - b.unitPriceCents);
		let freeUnits = Math.floor(productLines.reduce((sum, line) => sum + line.quantity, 0) / 2);
		for (const line of productLines) {
			const free = Math.min(line.quantity, freeUnits);
			bogoDiscountCents += free * line.unitPriceCents;
			freeUnits -= free;
		}
	}
	const discountCents = bogoDiscountCents + bundle.discountCents;
	return { discountCents, bogoDiscountCents, bundleDiscountCents: bundle.discountCents,
		bundlePercentOff: bundle.applied?.percentOff ?? 0, totalCents: subtotalCents - discountCents };
}
