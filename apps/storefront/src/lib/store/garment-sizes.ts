/**
 * The size guide's table, for a product the buyer sizes themselves.
 *
 * Read from the `specs.size_chart` metafield and nothing else. Two shapes of
 * row are understood, and the columns follow the rows rather than being fixed
 * here, because garments are measured differently from pet outfits:
 *
 *   - a garment for a person: `{ size, chestCm, lengthCm }`
 *   - a costume for a pet:    `{ size, weightMinKg, weightMaxKg, neckCm?, backLengthCm? }`
 *
 * A product with no rows (the reindeer hoodie, until the supplier's table
 * arrives) shows the size guide's "measurements on the way" note instead of a
 * table: a chart made up to fill the section would be the one people order
 * from. The costume has the supplier's weight bands and nothing else; neck
 * and back length appear the moment its rows carry them.
 */
import type { Product } from 'ecomwithai';

interface SizeRow {
	size: string;
	chestCm?: number;
	lengthCm?: number;
	weightMinKg?: number;
	weightMaxKg?: number;
	neckCm?: number;
	backLengthCm?: number;
}

export interface SizeGuideTable {
	columns: string[];
	rows: { size: string; cells: string[] }[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inches = (cm: number) => Math.round(cm / 2.54);
const pounds = (kg: number) => Math.round(kg * 2.20462);
const cm = (v: number) => `${v} cm (${inches(v)} in)`;
const kg = (min: number, max: number) => `${min}–${max} kg (${pounds(min)}–${pounds(max)} lb)`;

export function sizeGuideTable(product: Product): SizeGuideTable | undefined {
	const chart = product.metafields['specs.size_chart'];
	if (!Array.isArray(chart) || chart.length === 0) return undefined;
	const rows = (chart as SizeRow[]).filter((r) => r && r.size);

	// A person's garment: chest and length, both required on every row.
	if (rows.some((r) => isNum(r.chestCm))) {
		const fitted = rows.filter((r) => isNum(r.chestCm) && isNum(r.lengthCm));
		if (fitted.length === 0) return undefined;
		return {
			columns: ['Chest', 'Length'],
			rows: fitted.map((r) => ({ size: r.size, cells: [cm(r.chestCm!), cm(r.lengthCm!)] }))
		};
	}

	// A pet's costume: weight bands, plus whichever measures the rows carry.
	const weighed = rows.filter((r) => isNum(r.weightMinKg) && isNum(r.weightMaxKg));
	if (weighed.length === 0) return undefined;
	const hasNeck = weighed.some((r) => isNum(r.neckCm));
	const hasBack = weighed.some((r) => isNum(r.backLengthCm));
	return {
		columns: ['Weight', ...(hasNeck ? ['Neck'] : []), ...(hasBack ? ['Back length'] : [])],
		rows: weighed.map((r) => ({
			size: r.size,
			cells: [
				kg(r.weightMinKg!, r.weightMaxKg!),
				...(hasNeck ? [isNum(r.neckCm) ? cm(r.neckCm) : '—'] : []),
				...(hasBack ? [isNum(r.backLengthCm) ? cm(r.backLengthCm) : '—'] : [])
			]
		}))
	};
}
