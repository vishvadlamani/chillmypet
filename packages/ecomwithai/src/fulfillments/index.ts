import { withBusyRetry, type Client } from '../db/index.ts';

/**
 * Shipping, recorded beside the order rather than on it.
 *
 * `orders.status` stays `paid` once an order ships, deliberately. The payment
 * module treats `paid` as "already settled" when it decides whether a webhook or
 * a reconcile is a duplicate, and as "do not release stock" when a session
 * expires. Moving a shipped order to some other status would read as unpaid in
 * those places — a late event could settle it a second time, reporting a second
 * Purchase. A separate row cannot.
 */
export type Fulfillment = {
	orderNumber: string;
	carrier: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shippedAt: string;
};

export type MarkShippedInput = {
	carrier?: string;
	trackingNumber?: string;
	trackingUrl?: string;
};

export type MarkShippedResult =
	| { ok: true; fulfillment: Fulfillment }
	| { ok: false; reason: 'order_not_found' | 'not_paid' | 'already_shipped' };

export interface FulfillmentService {
	/** Only a paid order can ship, and only once. */
	markShipped(orderNumber: string, input?: MarkShippedInput): Promise<MarkShippedResult>;
	byOrderNumber(orderNumber: string): Promise<Fulfillment | null>;
	/** Fulfilments for a page of orders, keyed by order number. Unshipped orders are absent. */
	forOrders(orderNumbers: string[]): Promise<Map<string, Fulfillment>>;
	/** Paid orders with no fulfilment yet, oldest first — the queue to pack. */
	unshipped(opts?: { limit?: number }): Promise<string[]>;
}

const clean = (value: string | undefined, max: number): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, max) : null;
};

/** Only http(s), so a stored link can never become `javascript:` in an email or an admin page. */
const cleanUrl = (value: string | undefined): string | null => {
	const url = clean(value, 500);
	if (!url) return null;
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
	} catch {
		return null;
	}
};

function toFulfillment(row: Record<string, unknown>): Fulfillment {
	return {
		orderNumber: String(row.order_number),
		carrier: row.carrier === null ? null : String(row.carrier),
		trackingNumber: row.tracking_number === null ? null : String(row.tracking_number),
		trackingUrl: row.tracking_url === null ? null : String(row.tracking_url),
		shippedAt: String(row.shipped_at)
	};
}

const SELECT = `select o.order_number, f.carrier, f.tracking_number, f.tracking_url, f.shipped_at
	from fulfillments f join orders o on o.id = f.order_id`;

export function createFulfillmentService(deps: { db: Client; storeId: string }): FulfillmentService {
	const { db, storeId } = deps;

	async function byOrderNumber(orderNumber: string): Promise<Fulfillment | null> {
		const result = await db.execute({
			sql: `${SELECT} where f.store_id = ? and o.store_id = ? and o.order_number = ?`,
			args: [storeId, storeId, orderNumber]
		});
		return result.rows[0] ? toFulfillment(result.rows[0] as Record<string, unknown>) : null;
	}

	return {
		markShipped(orderNumber, input = {}) {
			return withBusyRetry(async () => {
				const found = await db.execute({
					sql: 'select id, status from orders where store_id = ? and order_number = ?',
					args: [storeId, orderNumber]
				});
				const row = found.rows[0];
				if (!row) return { ok: false, reason: 'order_not_found' } as const;
				if (String(row.status) !== 'paid') return { ok: false, reason: 'not_paid' } as const;

				// The unique (order_id) constraint is what makes a double click, or two
				// people packing the same order, ship it once.
				const inserted = await db.execute({
					sql: `insert into fulfillments (store_id, order_id, carrier, tracking_number, tracking_url)
					      values (?, ?, ?, ?, ?)
					      on conflict (order_id) do nothing`,
					args: [
						storeId,
						Number(row.id),
						clean(input.carrier, 80),
						clean(input.trackingNumber, 120),
						cleanUrl(input.trackingUrl)
					]
				});
				if (inserted.rowsAffected === 0) return { ok: false, reason: 'already_shipped' } as const;

				const fulfillment = await byOrderNumber(orderNumber);
				return fulfillment
					? ({ ok: true, fulfillment } as const)
					: ({ ok: false, reason: 'order_not_found' } as const);
			});
		},

		byOrderNumber,

		async forOrders(orderNumbers) {
			const map = new Map<string, Fulfillment>();
			if (orderNumbers.length === 0) return map;
			const result = await db.execute({
				sql: `${SELECT} where f.store_id = ? and o.store_id = ?
				      and o.order_number in (${orderNumbers.map(() => '?').join(', ')})`,
				args: [storeId, storeId, ...orderNumbers]
			});
			for (const row of result.rows) {
				const fulfillment = toFulfillment(row as Record<string, unknown>);
				map.set(fulfillment.orderNumber, fulfillment);
			}
			return map;
		},

		async unshipped(opts = {}) {
			const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
			const result = await db.execute({
				sql: `select o.order_number from orders o
				      left join fulfillments f on f.order_id = o.id
				      where o.store_id = ? and o.status = 'paid' and f.id is null
				      order by o.created_at asc, o.id asc
				      limit ?`,
				args: [storeId, limit]
			});
			return result.rows.map((r) => String(r.order_number));
		}
	};
}
