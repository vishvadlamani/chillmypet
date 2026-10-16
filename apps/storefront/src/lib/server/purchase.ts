import { toAmount, type Commerce, type Order } from 'ecomwithai';
import type { MetaBrowserIds } from '$lib/server/meta-browser-ids';

/**
 * One Purchase conversion, shared by every path that can report one.
 *
 * The event id is derived from the order number rather than minted per call.
 * The server event fires from the Stripe webhook and the browser event fires on
 * the success page — two different requests that can never pass a value to each
 * other — so a deterministic id is what lets Meta recognise them as one sale.
 * Order numbers are unique per store, which is the uniqueness Meta needs.
 */
export function purchaseEventId(orderNumber: string): string {
	return `purchase-${orderNumber}`;
}

export type PurchaseAttribution = {
	/** Meta's browser cookies. Absent when the customer blocks them. */
	fbp?: string;
	fbc?: string;
	clientIpAddress?: string;
	clientUserAgent?: string;
};

/**
 * What a Conversions API event knows about the browser behind a request.
 * `ids` is `locals.metaBrowserIds`, built once per request in hooks.server.ts,
 * so every event from one request carries the same click id.
 */
export function attributionFrom(
	ids: MetaBrowserIds,
	headers: Headers,
	clientIpAddress?: string
): PurchaseAttribution {
	return {
		fbp: ids.fbp,
		fbc: ids.fbc,
		clientIpAddress,
		clientUserAgent: headers.get('user-agent') ?? undefined
	};
}

/**
 * Never throws and never rejects: a marketing pixel must not be able to fail a
 * paid order. Callers dispatch this through `waitUntil` so the customer never
 * waits on Meta.
 */
export function sendPurchase(
	commerce: Commerce,
	order: Order,
	options: { eventSourceUrl: string; attribution?: PurchaseAttribution }
): Promise<void> {
	if (!commerce.meta) return Promise.resolve();

	const { shipping } = order;
	return commerce.meta
		.send({
			eventName: 'Purchase',
			eventId: purchaseEventId(order.orderNumber),
			eventSourceUrl: options.eventSourceUrl,
			user: {
				email: order.email,
				phone: shipping.phone ?? undefined,
				firstName: shipping.firstName,
				lastName: shipping.lastName,
				city: shipping.city,
				state: shipping.province ?? undefined,
				zip: shipping.postalCode,
				country: shipping.country,
				...options.attribution
			},
			customData: {
				currency: order.currency,
				value: toAmount(order.totalCents),
				content_type: 'product',
				content_ids: order.items.map((i) => i.sku),
				contents: order.items.map((i) => ({
					id: i.sku,
					quantity: i.quantity,
					item_price: i.unitPriceCents / 100
				})),
				num_items: order.items.reduce((sum, i) => sum + i.quantity, 0)
			}
		})
		.then((result) => {
			if (!result.sent) {
				console.error('Meta Purchase not sent', order.orderNumber, result.reason, result.detail);
			}
		})
		.catch((error) => {
			console.error('Meta Purchase dispatch failed', order.orderNumber, error);
		});
}
