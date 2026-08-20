/**
 * How much of the run is gone.
 *
 * Counted from real inventory: what is left is the sum of variant stock, and
 * what was sold is the sum of order lines. Nothing here is time-derived — a
 * progress bar that fills on a timer is a claim about demand that never
 * happened.
 */
import type { Commerce } from 'ecomwithai';
import type { Locale } from '$lib/i18n';
import { PRODUCT_SLUG } from './product';

export interface StockLevel {
	soldPct: number;
	remaining: number;
	total: number;
}

export async function loadStock(commerce: Commerce, locale: Locale): Promise<StockLevel> {
	const product = await commerce.catalog.getProduct(PRODUCT_SLUG, locale);
	if (!product) return { soldPct: 0, remaining: 0, total: 0 };

	const remaining = product.variants.reduce((sum, v) => sum + v.stock, 0);

	const sold = await commerce.db.execute({
		sql: `select coalesce(sum(oi.quantity), 0) as sold
		      from order_items oi
		      join orders o on o.id = oi.order_id
		      where oi.store_id = ? and oi.product_slug = ? and o.status <> 'cancelled'`,
		args: [commerce.store.id, PRODUCT_SLUG]
	});
	const soldUnits = Number(sold.rows[0]?.sold ?? 0);

	const total = remaining + soldUnits;
	return {
		soldPct: total > 0 ? Math.round((soldUnits / total) * 100) : 0,
		remaining,
		total
	};
}
