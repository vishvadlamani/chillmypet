/**
 * Inventory for the scarcity bar.
 *
 * Time-derived rather than a fixed number, because a "87% sold" that reads 87%
 * every day for a month is the version of this that stops working — visitors
 * who come back twice notice, and it's the claim that's hardest to defend if
 * anyone asks. Replace with a real inventory read; the block doesn't care where
 * the percentage comes from.
 */

const DAY = 86_400_000;

export interface StockLevel {
	/** 0–100. */
	soldPct: number;
	remaining: number;
	total: number;
}

export function loadStock(now: number = Date.now()): StockLevel {
	const total = 420;
	// Restocks weekly; sells through across the week.
	const elapsed = now % (7 * DAY);
	const sold = Math.min(total - 12, Math.floor((elapsed / (7 * DAY)) * total * 0.94));
	return {
		soldPct: Math.round((sold / total) * 100),
		remaining: total - sold,
		total
	};
}
