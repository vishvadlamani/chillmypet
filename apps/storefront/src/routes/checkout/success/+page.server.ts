import { error } from '@sveltejs/kit';
import { attributionFrom, purchaseEventId, sendPurchase } from '$lib/server/purchase';
import type { PageServerLoad } from './$types';

/**
 * Where Stripe returns the customer after the hosted payment page.
 *
 * The order number arrives in the query string, so it is an untrusted claim
 * about someone else's order as much as your own. Two rules follow: never show
 * anything that isn't already on the customer's own receipt, and never call an
 * order paid because the URL said so — read the payment row.
 */
export const load: PageServerLoad = async ({
	url,
	locals,
	cookies,
	request,
	platform,
	getClientAddress
}) => {
	const orderNumber = url.searchParams.get('order');
	if (!orderNumber) error(404, 'No order specified');

	const { commerce } = locals;
	const order = await commerce.orders.byNumber(orderNumber);
	// byNumber is already scoped to this tenant, so another store's order is a
	// miss here rather than a leak.
	if (!order) error(404, 'Order not found');

	let payment = commerce.payments ? await commerce.payments.byOrderNumber(orderNumber) : null;

	// Stripe redirects the moment the card is authorised, which can be before the
	// webhook lands — and for delayed methods it can be minutes. So "not paid
	// yet" is a normal state to render, not an error, and it must not read as a
	// completed sale.
	let paid = order.status === 'paid' || payment?.status === 'succeeded';

	/**
	 * Ask Stripe rather than only waiting to be told.
	 *
	 * The webhook remains the primary path and settles the sales where nobody
	 * comes back to this page. But it is a single delivery away from silence —
	 * an endpoint subscribed to the wrong events, a rotated secret, an outage —
	 * and that failure is invisible from in here: the card is charged, the order
	 * sits at `pending_payment`, this page says "processing" forever, and the
	 * sale is reported to Meta by neither half of the Purchase pair, because the
	 * browser event needs `paid` below and the server event needs the webhook.
	 * Nothing logs, because nothing arrived.
	 *
	 * `reconcile` asserts the same amount the webhook does and returns
	 * `order_paid` only to the caller that actually applied the change, so a
	 * webhook landing either side of this reports nothing extra.
	 */
	if (!paid && commerce.payments) {
		const settled = await commerce.payments.reconcile({ orderNumber }).catch((err) => {
			// A receipt must render whether or not Stripe is reachable.
			console.error('Reconcile failed', orderNumber, err);
			return null;
		});

		if (settled?.handled && settled.action === 'order_paid') {
			paid = true;
			payment = await commerce.payments.byOrderNumber(orderNumber);

			// The server's half of this sale. Worth sending from here even though
			// the browser is about to send its own: this request carries the
			// customer's cookies, address and user agent, which the webhook — a
			// request from Stripe — never has. Same derived event id, so Meta
			// still counts one sale.
			const purchase = sendPurchase(commerce, order, {
				eventSourceUrl: url.href,
				attribution: attributionFrom(cookies, url, request.headers, getClientAddress())
			});

			// Don't make the customer wait on Meta. Called as a method —
			// destructuring waitUntil loses `this` and throws on Workers.
			const context = platform?.context;
			if (context && typeof context.waitUntil === 'function') context.waitUntil(purchase);
		}
	}

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
