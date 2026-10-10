/**
 * Bundle tiers, add-ons and colour options.
 *
 * The tiers ARE the quantity breaks the server prices against — read from
 * `commerce.quantityBreaks` rather than restated here, because a tier that
 * advertises a discount the order won't apply is a checkout that quotes two
 * different totals.
 */
import type { Commerce } from 'ecomwithai';
import { applyQuantityBreak } from 'ecomwithai';
import { formatMoney, type Locale } from '$lib/i18n';
import { PRODUCT_SLUG } from './product';

export interface BundleTier {
	id: string;
	title: string;
	subtitle?: string;
	price: string;
	compareAt?: string;
	badge?: string;
	image?: string;
	alt?: string;
	units?: number;
	selected?: boolean;
}

export interface BundleAddon {
	id: string;
	label: string;
	price?: string;
	compareAt?: string;
	control?: 'toggle' | 'checkbox';
	on?: boolean;
	fixed?: boolean;
}

export async function loadBundles(
	commerce: Commerce,
	locale: Locale,
	slug: string = PRODUCT_SLUG
): Promise<{ tiers: BundleTier[]; addons: BundleAddon[]; colours: string[] }> {
	const product = await commerce.catalog.getProduct(slug, locale);
	if (!product) return { tiers: [], addons: [], colours: [] };

	const money = (cents: number) => formatMoney(cents, locale, product.currency);

	// One tier per quantity the server gives a break at, plus the single unit.
	const quantities = [1, ...commerce.quantityBreaks.map((b) => b.minQuantity)].sort(
		(a, b) => a - b
	);
	const best = Math.max(...quantities);

	const tiers: BundleTier[] = quantities.map((units) => {
		const subtotal = product.priceCents * units;
		const applied = applyQuantityBreak(commerce.quantityBreaks, subtotal, units);
		const compareAt = (product.compareAtCents ?? product.priceCents) * units;
		const savedPct = Math.round((1 - applied.totalCents / compareAt) * 100);

		return {
			id: `qty-${units}`,
			title: units === 1 ? product.title : `${units} × ${product.title}`,
			subtitle: savedPct > 0 ? `You save ${savedPct}%` : undefined,
			price: money(applied.totalCents),
			compareAt: compareAt > applied.totalCents ? money(compareAt) : undefined,
			// The middle tier is the one most stores want pushed; with three
			// quantities that is the 2-pack, and it is also where the first
			// discount appears.
			badge: units === best ? 'Best value' : units > 1 ? 'Most popular' : undefined,
			image:
				product.media.find((m) => m.optionValue === product.options[0]?.values[0]?.value)?.url ??
				product.media[0]?.url,
			alt: product.title,
			units,
			selected: units === 1
		};
	});

	return {
		tiers,
		// No add-on products exist in the catalogue yet. An empty array still
		// resolves, so the picker renders without an add-on row rather than the
		// whole block being dropped.
		addons: [],
		// `label` is nullable in the catalogue — a store can ship option values
		// with no display text and translate them in the UI instead.
		colours: (product.options[0]?.values ?? []).map((v) => v.label ?? v.value)
	};
}
