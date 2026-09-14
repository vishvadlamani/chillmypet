import { toAmount, type Commerce, type Order } from 'ecomwithai';
import type { Identity } from '$lib/server/identity';

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

/**
 * Whatever the request could tell us about who is buying. The Stripe webhook
 * has no request of the customer's to read, so it reconstructs the part it
 * carried through session metadata.
 */
export type PurchaseAttribution = Identity;

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
			// Attribution spreads last, but it never carries a raw `email` or
			// `phone` — only hashes, which `buildUserData` drops where the order
			// already supplied the real thing. A shared device does not get to
			// relabel someone else's purchase.
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
