import type { Order } from 'ecomwithai';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

/**
 * The order list. Two views — the queue to pack (paid, not shipped, oldest
 * first) and everything (newest first) — plus a search box that takes an order
 * number or a customer's email. Access is checked in hooks.server.ts before this
 * runs.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { commerce } = locals;
	const view = url.searchParams.get('view') === 'all' ? 'all' : 'to-ship';
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const page = Math.max(1, Math.trunc(Number(url.searchParams.get('page'))) || 1);

	let orders: Order[];
	let hasMore = false;
	let customer = null;

	if (q.includes('@')) {
		orders = await commerce.orders.list({ email: q, limit: 250 });
		customer = await commerce.customers.byEmail(q);
	} else if (q) {
		const found = await commerce.orders.byNumber(q.toUpperCase());
		orders = found ? [found] : [];
	} else if (view === 'to-ship') {
		const numbers = await commerce.fulfillments.unshipped({ limit: 200 });
		orders = (await Promise.all(numbers.map((n) => commerce.orders.byNumber(n)))).filter(
			(o): o is Order => o !== null
		);
	} else {
		orders = await commerce.orders.list({ limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
		hasMore = orders.length > PAGE_SIZE;
		orders = orders.slice(0, PAGE_SIZE);
	}

	const shipped = await commerce.fulfillments.forOrders(orders.map((o) => o.orderNumber));

	return {
		view,
		q,
		page,
		hasMore,
		customer: customer && {
			email: customer.email,
			name: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
			phone: customer.phone,
			ordersCount: customer.ordersCount,
			totalSpentCents: customer.totalSpentCents,
			createdAt: customer.createdAt
		},
		currency: locals.store.currency,
		orders: orders.map((o) => ({
			orderNumber: o.orderNumber,
			createdAt: o.createdAt ?? null,
			email: o.email,
			name: `${o.shipping.firstName} ${o.shipping.lastName}`.trim(),
			country: o.shipping.country,
			totalCents: o.totalCents,
			currency: o.currency,
			status: o.status,
			units: o.items.reduce((sum, i) => sum + i.quantity, 0),
			shippedAt: shipped.get(o.orderNumber)?.shippedAt ?? null
		}))
	};
};
