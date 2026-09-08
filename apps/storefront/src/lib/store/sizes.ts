/**
 * The size chart, from this catalogue's own measurements.
 *
 * It replaced a competitor's chart image that shipped with the block library —
 * which carried their wordmark, and, less obviously but worse, their sizing.
 * Their XL runs to 43" where this jacket's runs to 36": a customer measuring
 * against the wrong chart orders a size that doesn't fit and returns it, and
 * every one of those is paid for twice.
 *
 * Both unit systems on one line, imperial in brackets. The store sells to the
 * US and to metric markets from the same page, and a chart someone has to
 * convert is a chart they close.
 */
import type { Commerce } from 'ecomwithai';
import { createTranslator, type Locale } from '$lib/i18n';
import { PRODUCT_SLUG } from './product';

interface SizeRow {
	size: string;
	chestMinCm: number;
	chestMaxCm: number;
	weightMinKg: number;
	weightMaxKg: number;
}

export interface SizeChart {
	/** `bullet_list` items — one line per size. */
	rows?: { text: string }[];
	hint?: string;
	title?: string;
}

const inches = (cm: number) => Math.round(cm / 2.54);
const pounds = (kg: number) => Math.round(kg * 2.20462);

export async function loadSizeChart(
	commerce: Commerce,
	locale: Locale,
	slug: string = PRODUCT_SLUG
): Promise<SizeChart> {
	const product = await commerce.catalog.getProduct(slug, locale);
	const chart = (product?.metafields['specs.size_chart'] ?? []) as SizeRow[];
	// Undefined, not an empty array: `requires` drops a block when its path does
	// not resolve, and a heading over an empty list is worse than no section.
	if (!Array.isArray(chart) || chart.length === 0) return {};

	const t = createTranslator(locale);

	return {
		title: t('product.sizeChart'),
		hint: t('product.sizeChartHint'),
		rows: chart.map((row) => ({
			text:
				`**${row.size}** · ${t('product.sizeChartColumns.chest')} ` +
				`${row.chestMinCm}–${row.chestMaxCm} cm (${inches(row.chestMinCm)}–${inches(row.chestMaxCm)} in) · ` +
				`${row.weightMinKg}–${row.weightMaxKg} kg (${pounds(row.weightMinKg)}–${pounds(row.weightMaxKg)} lb)`
		}))
	};
}

export interface SizeOption {
	value: string;
	label: string;
	/** False when nothing in the catalogue stocks it — struck through, not hidden. */
	available: boolean;
}

/**
 * The sizes a visitor can actually choose, for the `size_picker` block.
 *
 * Separate from the chart above because they answer different questions and one
 * can exist without the other: this catalogue's costume has three sizes and no
 * published measurements, and the page has to sell it anyway.
 *
 * ⚠️ AVAILABILITY HERE IS ACROSS ALL COLOURWAYS. For a product with one
 * colourway — which is the only kind currently carrying a `size_picker` — that
 * is exact. For a sparse colour × size matrix like the life jacket's it is not:
 * "M" would read as available because SOME colour stocks it, and a visitor who
 * picked a colour that doesn't would choose a combination that cannot be built.
 * Before putting this block on a multi-colourway page, the colour choice has to
 * reach it — today the bundle picker keeps that choice to itself and only hands
 * it over on submit.
 */
export async function loadSizeOptions(
	commerce: Commerce,
	locale: Locale,
	slug: string = PRODUCT_SLUG
): Promise<{ options?: SizeOption[] }> {
	const product = await commerce.catalog.getProduct(slug, locale);
	const values = product?.options[1]?.values ?? [];
	// Undefined, not an empty array: `requires` has to be able to drop the block.
	if (values.length === 0) return {};

	return {
		options: values.map((v) => ({
			value: v.value,
			label: v.label ?? v.value,
			available: product!.variants.some((variant) => variant.options[1] === v.value && variant.stock > 0)
		}))
	};
}
