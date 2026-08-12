import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * Creates a Stripe-hosted checkout session for an order that is still awaiting
 * payment, so the page can recover when the embedded form cannot mount.
 *
 * That happens for two real reasons: a publishable key that doesn't match the
 * account, and — far more often on paid social traffic — an ad blocker eating
 * `js.stripe.com`. Either way the customer has decided to buy and must still be
 * able to, so failing over to the hosted page is worth more than the redirect
 * costs.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const { payments, orders } = locals.commerce;
	if (!payments) return json({ error: 'payments_unavailable' }, { status: 503 });

	let orderNumber = '';
	try {
		const body = (await request.json()) as { orderNumber?: unknown };
		orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber : '';
	} catch {
		return json({ error: 'bad_request' }, { status: 400 });
	}
	if (!orderNumber) return json({ error: 'bad_request' }, { status: 400 });

	// byNumber is tenant-scoped, so another store's order is simply not found.
	const order = await orders.byNumber(orderNumber);
	// Only an unpaid order may be handed a payment page. Without this an order
	// number — which is guessable — could be used to mint sessions against orders
	// that are already settled, cancelled or refunded.
	if (!order || order.status !== 'pending_payment') {
		return json({ error: 'not_payable' }, { status: 404 });
	}

	try {
		const checkout = await payments.startCheckout({
			orderNumber: order.orderNumber,
			uiMode: 'hosted',
			successUrl: `${url.origin}/checkout/success?order=${encodeURIComponent(order.orderNumber)}`,
			cancelUrl: `${url.origin}/checkout?cancelled=${encodeURIComponent(order.orderNumber)}`
		});
		return json({ url: checkout.url });
	} catch (error) {
		console.error('hosted fallback session failed', order.orderNumber, error);
		return json({ error: 'payment_unavailable' }, { status: 502 });
	}
};
