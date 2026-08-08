import { db } from './db';
import { priceVariants } from './catalog';
import { SHIPPING_RATES, type ShippingMethod } from '$lib/shipping';

export { isShippingMethod, SHIPPING_RATES, type ShippingMethod } from '$lib/shipping';

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

export type PlacedOrder = {
	orderNumber: string;
	subtotalCents: number;
	shippingCents: number;
	totalCents: number;
	currency: string;
	items: { sku: string; quantity: number; unitPriceCents: number }[];
};

export type CheckoutErrorCode = 'cart_empty' | 'variant_unavailable';

export class CheckoutError extends Error {
	constructor(
		readonly code: CheckoutErrorCode,
		readonly detail?: string
	) {
		super(code);
		this.name = 'CheckoutError';
	}
}

function orderNumber(): string {
	return `CMP-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function createOrder(input: {
	lines: CartLine[];
	shipping: ShippingDetails;
	method: ShippingMethod;
	locale: string;
}): Promise<PlacedOrder> {
	const lines = input.lines.filter((l) => Number.isInteger(l.quantity) && l.quantity > 0);
	if (lines.length === 0) throw new CheckoutError('cart_empty');

	const priced = await priceVariants(lines.map((l) => l.variantId));

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
	const number = orderNumber();

	const tx = await db().transaction('write');
	try {
		// Guarded decrement: if another order took the last unit between pricing
		// and here, rowsAffected is 0 and we fail instead of overselling.
		for (const item of resolved) {
			const result = await tx.execute({
				sql: `update product_variants set stock = stock - ?
				      where id = ? and stock >= ?`,
				args: [item.quantity, item.variantId, item.quantity]
			});
			if (result.rowsAffected === 0) {
				throw new CheckoutError('variant_unavailable', item.sku);
			}
		}

		const inserted = await tx.execute({
			sql: `insert into orders (
			        order_number, email, phone, first_name, last_name,
			        address1, address2, city, province, postal_code, country,
			        shipping_method, subtotal_cents, shipping_cents, discount_cents,
			        total_cents, currency, locale, status
			      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				number,
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
				        order_id, variant_id, product_slug, colour, size, sku,
				        unit_price_cents, quantity
				      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
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

		await tx.commit();
	} catch (error) {
		await tx.rollback();
		throw error;
	}

	return {
		orderNumber: number,
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
}
