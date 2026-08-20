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
