/**
 * Price changes a live store has to pick up.
 *
 * `products.js` is additive: a product the store already has is never
 * rewritten, so changing `PRICE_CENTS` in a product's script changes a fresh
 * database and nothing else. A change listed here is applied by the Worker's
 * catalogue sync (`src/lib/server/catalogue.ts`) and by `npm run db:products`.
 *
 * Each change is guarded by the price it replaces: only a variant still at
 * `fromCents` moves, so a run is a no-op once it has applied, and a price set
 * by hand in the meantime is never overwritten. Orders keep the unit price
 * they were placed at (`order_items.unit_price_cents`); carts are re-priced
 * by the server on every request, so nothing in flight charges the old price.
 *
 * Keep entries after they have run: a database restored from before the
 * change still needs them. Change the product's script in the same commit, so
 * a fresh seed and a live store end up at the same price.
 *
 * Imported by the Worker, so nothing here may touch `process`, the
 * filesystem or the network.
 */
export const PRICE_CHANGES = [
	{
		slug: 'dog-christmas-costume',
		fromCents: 2850,
		toCents: 2799,
		// One price for the two Christmas dog outfits, the reindeer hoodie's.
		date: '2026-10-17'
	}
];
