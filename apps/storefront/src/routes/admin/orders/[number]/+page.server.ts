import { error, fail } from '@sveltejs/kit';
import { sendShippingNotification } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const { commerce } = locals;
	const order = await commerce.orders.byNumber(params.number);
	if (!order) error(404, 'No such order');

	const [payment, fulfillment, customer] = await Promise.all([
		commerce.payments?.byOrderNumber(order.orderNumber) ?? null,
		commerce.fulfillments.byOrderNumber(order.orderNumber),
		commerce.customers.byEmail(order.email)
	]);

	return {
		order,
		payment: payment && {
			provider: payment.provider,
			providerRef: payment.providerRef,
			status: payment.status,
			amountCents: payment.amountCents,
			currency: payment.currency,
			failureReason: payment.failureReason
		},
		fulfillment,
		customer: customer && { ordersCount: customer.ordersCount, totalSpentCents: customer.totalSpentCents },
		emailEnabled: Boolean(locals.email.apiKey)
	};
};

export const actions: Actions = {
	ship: async ({ locals, params, request, platform }) => {
		const form = await request.formData();
		const field = (name: string) => {
			const value = form.get(name);
			return typeof value === 'string' ? value : undefined;
		};

		const result = await locals.commerce.fulfillments.markShipped(params.number, {
			carrier: field('carrier'),
			trackingNumber: field('trackingNumber'),
			trackingUrl: field('trackingUrl')
		});
		if (!result.ok) return fail(409, { reason: result.reason });

		// Only the request that actually recorded the shipment gets here — the
		// unique constraint turns a double click into `already_shipped` above —
		// so the customer hears about it once.
		const order = await locals.commerce.orders.byNumber(params.number);
		const notify = order
			? sendShippingNotification(locals.email, order, result.fulfillment)
			: Promise.resolve('not_configured' as const);
		// Called as a method — destructuring waitUntil loses `this` and throws on Workers.
		const context = platform?.context;
		if (context && typeof context.waitUntil === 'function') context.waitUntil(notify);
		else await notify;

		return { shipped: true };
	}
};
