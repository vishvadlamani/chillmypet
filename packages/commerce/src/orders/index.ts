import type { Client } from '../db/index.ts';
import type { CatalogService } from '../catalog/index.ts';
import type { CustomerService } from '../customers/index.ts';
import { SHIPPING_RATES, type ShippingMethod } from '../shipping.ts';

export type CartLine = { variantId: number; quantity: number };

export type ShippingDetails = {
	email: string;
	phone?: string;
	firstName: string;
	lastName: string;
	address1: string;
	address2?: string;
	city: string;
	province?: string;
	postalCode: string;
	country: string;
};

export type CreateOrderInput = {
	lines: CartLine[];
	shipping: ShippingDetails;
	method: ShippingMethod;
	locale: string;
	marketingConsent?: boolean;
};

export type PlacedOrder = {
	orderNumber: string;
	customerId: number;
	subtotalCents: number;
	shippingCents: number;
	totalCents: number;
	currency: string;
	items: { sku: string; quantity: number; unitPriceCents: number }[];
};

export type CheckoutErrorCode = 'cart_empty' | 'variant_unavailable';

export class CheckoutError extends Error {
	// Assigned explicitly rather than via constructor parameter properties: this
	// package ships as source, and Node's type stripping rejects that syntax.
	readonly code: CheckoutErrorCode;
	readonly detail?: string;

	constructor(code: CheckoutErrorCode, detail?: string) {
		super(code);
		this.name = 'CheckoutError';
		this.code = code;
		this.detail = detail;
	}
}

export interface OrderService {
	create(input: CreateOrderInput): Promise<PlacedOrder>;
	byNumber(orderNumber: string): Promise<PlacedOrder | null>;
}

export function createOrderService(deps: {
	db: Client;
	storeId: string;
	catalog: CatalogService;
	customers: CustomerService;
	/** Injected so tests can produce deterministic order numbers. */
	orderNumber?: () => string;
}): OrderService {
	const { db, storeId, catalog, customers } = deps;
	const nextOrderNumber =
		deps.orderNumber ??
		(() => `CMP-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`);

	return {
		async create(input) {
			const lines = input.lines.filter(
				(l) => Number.isInteger(l.quantity) && l.quantity > 0
			);
			if (lines.length === 0) throw new CheckoutError('cart_empty');

			const priced = await catalog.priceVariants(lines.map((l) => l.variantId));

			let subtotalCents = 0;
			const resolved = lines.map((line) => {
				const variant = priced.get(line.variantId);
				if (!variant) throw new CheckoutError('variant_unavailable');
				subtotalCents += variant.unitPriceCents * line.quantity;
				return { ...variant, quantity: line.quantity };
			});

			const currency = resolved[0].currency;
			const shippingCents = SHIPPING_RATES[input.method];
			const totalCents = subtotalCents + shippingCents;
			const orderNumber = nextOrderNumber();

			const tx = await db.transaction('write');
			try {
				// Guarded decrement: if another order took the last unit between
				// pricing and here, rowsAffected is 0 and we fail rather than oversell.
				for (const item of resolved) {
					const result = await tx.execute({
						sql: `update product_variants set stock = stock - ?
						      where id = ? and store_id = ? and stock >= ?`,
						args: [item.quantity, item.variantId, storeId, item.quantity]
					});
					if (result.rowsAffected === 0) {
						throw new CheckoutError('variant_unavailable', item.sku);
					}
				}

				// Inside the transaction: no customer row for a rolled-back order.
				const customerId = await customers.upsert(
					{
						email: input.shipping.email,
						firstName: input.shipping.firstName,
						lastName: input.shipping.lastName,
						phone: input.shipping.phone,
						marketingConsent: input.marketingConsent
					},
					tx
				);

				const inserted = await tx.execute({
					sql: `insert into orders (
					        store_id, customer_id, order_number, email, phone,
					        first_name, last_name, address1, address2, city, province,
					        postal_code, country, shipping_method, subtotal_cents,
					        shipping_cents, discount_cents, total_cents, currency, locale, status
					      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					args: [
						storeId,
						customerId,
						orderNumber,
						input.shipping.email,
						input.shipping.phone ?? null,
						input.shipping.firstName,
						input.shipping.lastName,
						input.shipping.address1,
						input.shipping.address2 ?? null,
						input.shipping.city,
						input.shipping.province ?? null,
						input.shipping.postalCode,
						input.shipping.country,
						input.method,
						subtotalCents,
						shippingCents,
						0,
						totalCents,
						currency,
						input.locale,
						'pending_payment'
					]
				});

				const orderId = Number(inserted.lastInsertRowid);

				for (const item of resolved) {
					await tx.execute({
						sql: `insert into order_items (
						        store_id, order_id, variant_id, product_slug, colour, size, sku,
						        unit_price_cents, quantity
						      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						args: [
							storeId,
							orderId,
							item.variantId,
							item.productSlug,
							item.colour,
							item.size,
							item.sku,
							item.unitPriceCents,
							item.quantity
						]
					});
				}

				await customers.recordOrder(customerId, totalCents, tx);
				await tx.commit();

				return {
					orderNumber,
					customerId,
					subtotalCents,
					shippingCents,
					totalCents,
					currency,
					items: resolved.map((item) => ({
						sku: item.sku,
						quantity: item.quantity,
						unitPriceCents: item.unitPriceCents
					}))
				};
			} catch (error) {
				await tx.rollback();
				throw error;
			}
		},

		async byNumber(orderNumber) {
			const orderRows = await db.execute({
				sql: `select id, customer_id, order_number, subtotal_cents, shipping_cents,
				             total_cents, currency
				      from orders where store_id = ? and order_number = ?`,
				args: [storeId, orderNumber]
			});

			const row = orderRows.rows[0];
			if (!row) return null;

			const items = await db.execute({
				sql: `select sku, quantity, unit_price_cents from order_items
				      where store_id = ? and order_id = ?`,
				args: [storeId, Number(row.id)]
			});

			return {
				orderNumber: String(row.order_number),
				customerId: Number(row.customer_id),
				subtotalCents: Number(row.subtotal_cents),
				shippingCents: Number(row.shipping_cents),
				totalCents: Number(row.total_cents),
				currency: String(row.currency),
				items: items.rows.map((i) => ({
					sku: String(i.sku),
					quantity: Number(i.quantity),
					unitPriceCents: Number(i.unit_price_cents)
				}))
			};
		}
	};
}

export { SHIPPING_RATES, isShippingMethod, type ShippingMethod } from '../shipping.ts';
