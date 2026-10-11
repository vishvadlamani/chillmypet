/**
 * A garment's size chart, for the wearer.
 *
 * Read from the `specs.size_chart` metafield and nothing else. The Christmas
 * hoodie has none yet: there are no supplier measurements, and a chart made up
 * to fill the section would be the one people order from. Empty means the
 * size guide shows its "measurements on the way" note instead of a table.
 */
import type { Product } from 'ecomwithai';

interface GarmentRow {
	size: string;
	chestCm: number;
	lengthCm: number;
}

const inches = (cm: number) => Math.round(cm / 2.54);

export function garmentSizeRows(
	product: Product
): { size: string; chest: string; length: string }[] | undefined {
	const chart = product.metafields['specs.size_chart'];
	if (!Array.isArray(chart) || chart.length === 0) return undefined;
	return (chart as GarmentRow[])
		.filter((r) => r && r.size && Number.isFinite(r.chestCm) && Number.isFinite(r.lengthCm))
		.map((r) => ({
			size: r.size,
			chest: `${r.chestCm} cm (${inches(r.chestCm)} in)`,
			length: `${r.lengthCm} cm (${inches(r.lengthCm)} in)`
		}));
}
