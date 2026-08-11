import { error } from '@sveltejs/kit';
import { purchaseEventId } from '$lib/server/purchase';
import type { PageServerLoad } from './$types';

/**
 * Where Stripe returns the customer after the hosted payment page.
 *
 * The order number arrives in the query string, so it is an untrusted claim
 * about someone else's order as much as your own. Two rules follow: never show
 * anything that isn't already on the customer's own receipt, and never call an
 * order paid because the URL said so — read the payment row.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const orderNumber = url.searchParams.get('order');
	if (!orderNumber) error(404, 'No order specified');

	const { commerce } = locals;
	const order = await commerce.orders.byNumber(orderNumber);
	// byNumber is already scoped to this tenant, so another store's order is a
	// miss here rather than a leak.
	if (!order) error(404, 'Order not found');

	const payment = commerce.payments ? await commerce.payments.byOrderNumber(orderNumber) : null;

	// Stripe redirects the moment the card is authorised, which can be before the
	// webhook lands — and for delayed methods it can be minutes. So "not paid
	// yet" is a normal state to render, not an error, and it must not read as a
	// completed sale.
	const paid = order.status === 'paid' || payment?.status === 'succeeded';

	return {
		paid,
		paymentStatus: payment?.status ?? null,
		// Only what belongs on a receipt. No address, no phone: the query string
		// is guessable and this page has no session behind it.
		order: {
			orderNumber: order.orderNumber,
			totalCents: order.totalCents,
			currency: order.currency,
			items: order.items.map((i) => ({
				sku: i.sku,
				title: i.title,
				quantity: i.quantity,
				unitPriceCents: i.unitPriceCents
			}))
		},
		// Matches the id the webhook sent with the Conversions API event, so Meta
		// counts one sale rather than two.
		eventId: purchaseEventId(order.orderNumber)
	};
};
