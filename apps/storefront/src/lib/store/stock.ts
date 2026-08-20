/**
 * How full the scarcity bar reads.
 *
 * Marketing owns this number, not this database. Inventory is maintained
 * outside the storefront, so a bar computed from the `stock` column and the
 * order table was reporting on a count that isn't the real one — it read 0%
 * on a store that has sold units elsewhere.
 *
 * This does not touch inventory in either direction. Real stock still governs
 * what can be bought: `orders.create()` decrements it inside a transaction and
 * refuses the line when it would go negative, which is what stops overselling.
 * This is display only.
 *
 * `stock_sold_pct` in store settings moves it without a deploy:
 *
 *   update store_settings set value = '80'
 *    where store_id = 'chillmypet' and key = 'stock_sold_pct';
 */

export interface StockLevel {
	soldPct: number;
}

/** Where the bar sits when no store setting says otherwise. */
const DEFAULT_SOLD_PCT = 70;

export function loadStock(settings: Record<string, string> = {}): StockLevel {
	const configured = Number(settings.stock_sold_pct);
	const pct = Number.isFinite(configured) ? configured : DEFAULT_SOLD_PCT;
	// Clamped: 0 renders an empty bar that reads as "nobody wants this", and
	// above 99 the bar is full, which reads as sold out next to a buy button.
	return { soldPct: Math.min(99, Math.max(1, Math.round(pct))) };
}
