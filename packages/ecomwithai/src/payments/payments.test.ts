/**
 * Payments, tested against a mock Stripe — no keys, no network.
 *
 * The webhook endpoint is the highest-value target in a commerce system: anyone
 * can POST to it, and a handler that trusts the body marks orders paid for free.
 * Most of what follows is an attacker's checklist.
 *
 *   node --experimental-strip-types src/payments/payments.test.ts
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommerce, createStoreService } from '../index.ts';
import { createTestDb, seedProduct, seedStore } from '../testing.ts';
import type { Store } from '../stores/index.ts';
import { encodeForm } from './stripe.ts';
import { signStripePayload, verifyStripeSignature } from './signature.ts';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
	if (!ok) {
		console.log(`      expected ${JSON.stringify(expected)}`);
		console.log(`      actual   ${JSON.stringify(actual)}`);
		failures += 1;
	}
}

const SECRET = 'whsec_test_secret';
const NOW = 1786200000;

// --- form encoding ---
check(
	'nested objects use bracket paths',
	decodeURIComponent(encodeForm({ price_data: { currency: 'usd', unit_amount: 1500 } })),
	'price_data[currency]=usd&price_data[unit_amount]=1500'
);
check(
	'arrays are indexed',
	decodeURIComponent(encodeForm({ line_items: [{ quantity: 2 }, { quantity: 1 }] })),
	'line_items[0][quantity]=2&line_items[1][quantity]=1'
);
check('undefined and null are omitted', encodeForm({ a: 1, b: undefined, c: null }), 'a=1');
check(
	'values are percent-encoded',
	encodeForm({ name: 'Tee & Mug' }),
	'name=Tee%20%26%20Mug'
);

// --- signature verification ---
const payload = '{"id":"evt_1","type":"checkout.session.completed"}';
const goodHeader = await signStripePayload(SECRET, payload, NOW);

check('a valid signature verifies',
	(await verifyStripeSignature({ payload, header: goodHeader, secret: SECRET, nowSeconds: NOW })).valid,
	true);

check('a tampered payload fails',
	await verifyStripeSignature({
		payload: payload.replace('evt_1', 'evt_2'),
		header: goodHeader, secret: SECRET, nowSeconds: NOW
	}).then((r) => (r.valid ? 'valid' : r.reason)),
	'no_matching_signature');

check('the wrong secret fails',
	await verifyStripeSignature({ payload, header: goodHeader, secret: 'whsec_other', nowSeconds: NOW })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'no_matching_signature');

check('an old signature is rejected (replay)',
	await verifyStripeSignature({ payload, header: goodHeader, secret: SECRET, nowSeconds: NOW + 3600 })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'timestamp_out_of_tolerance');

check('a far-future signature is rejected',
	await verifyStripeSignature({ payload, header: goodHeader, secret: SECRET, nowSeconds: NOW - 3600 })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'timestamp_out_of_tolerance');

check('a missing header is rejected',
	await verifyStripeSignature({ payload, header: null, secret: SECRET, nowSeconds: NOW })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'missing_header');

check('a header with no v1 is rejected',
	await verifyStripeSignature({ payload, header: `t=${NOW}`, secret: SECRET, nowSeconds: NOW })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'no_signatures');

check('a header with no timestamp is rejected',
	await verifyStripeSignature({ payload, header: 'v1=abc', secret: SECRET, nowSeconds: NOW })
		.then((r) => (r.valid ? 'valid' : r.reason)),
	'missing_timestamp');

// Stripe sends one v1 per active secret while a secret is being rotated.
const rotated = `${goodHeader},v1=${'0'.repeat(64)}`;
check('any matching signature among several is accepted',
	(await verifyStripeSignature({ payload, header: rotated, secret: SECRET, nowSeconds: NOW })).valid,
	true);

// --- store fixture ---
const dir = await mkdtemp(join(tmpdir(), 'ecomwithai-pay-'));
const db = await createTestDb(`file:${join(dir, 'pay.db')}`);
await seedStore(db, { id: 'shop', domain: 'shop.test' });
const seed = await seedProduct(db, 'shop', {
	slug: 'tee',
	title: 'Cotton Tee',
	variants: [{ sku: 'TEE-1', priceCents: 2000, stock: 10 }]
});

const requests: { path: string; body: string; headers: Record<string, string> }[] = [];
let sessionCounter = 0;
let intentCounter = 0;
// Stripe objects the charge-shaped events only reference, so the test can say
// what a retrieval finds.
const charges: Record<string, Record<string, unknown>> = {};
const intents: Record<string, Record<string, unknown>> = {};

const mockStripe: typeof fetch = async (input, init) => {
	const url = String(input);
	const path = url.replace('https://api.stripe.com', '');
	const headers = Object.fromEntries(
		Object.entries((init?.headers ?? {}) as Record<string, string>)
	);
	requests.push({ path, body: String(init?.body ?? ''), headers });

	if (path === '/v1/checkout/sessions') {
		sessionCounter += 1;
		return new Response(
			JSON.stringify({
				id: `cs_test_${sessionCounter}`,
				url: `https://checkout.stripe.com/pay/cs_test_${sessionCounter}`,
				status: 'open',
				payment_intent: `pi_test_${sessionCounter}`
			}),
			{ status: 200 }
		);
	}
	if (path === '/v1/coupons') {
		return new Response(JSON.stringify({ id: 'coupon_test_1' }), { status: 200 });
	}
	if (path === '/v1/payment_intents') {
		intentCounter += 1;
		const params = new URLSearchParams(String(init?.body ?? ''));
		const id = `pi_inline_${intentCounter}`;
		intents[id] = {
			id,
			amount: Number(params.get('amount')),
			currency: params.get('currency'),
			status: 'requires_payment_method',
			metadata: { order_number: params.get('metadata[order_number]'), store_id: 'shop' }
		};
		return new Response(JSON.stringify({ ...intents[id], client_secret: `${id}_secret` }), {
			status: 200
		});
	}
	// A Checkout Session retrieval is how a refund finds the intent behind a
	// hosted order, and charge/intent retrievals are how a dispute or a fraud
	// warning finds the order.
	if (path.startsWith('/v1/checkout/sessions/')) {
		const id = decodeURIComponent(path.slice('/v1/checkout/sessions/'.length));
		return new Response(
			JSON.stringify({
				id,
				status: 'complete',
				payment_intent: id.replace('cs_test_', 'pi_test_')
			}),
			{ status: 200 }
		);
	}
	if (path.startsWith('/v1/charges/')) {
		const id = decodeURIComponent(path.slice('/v1/charges/'.length));
		return charges[id]
			? new Response(JSON.stringify(charges[id]), { status: 200 })
			: new Response(JSON.stringify({ error: { message: `no charge ${id}` } }), { status: 404 });
	}
	if (path.startsWith('/v1/payment_intents/')) {
		const id = decodeURIComponent(path.slice('/v1/payment_intents/'.length));
		return intents[id]
			? new Response(JSON.stringify(intents[id]), { status: 200 })
			: new Response(JSON.stringify({ error: { message: `no intent ${id}` } }), { status: 404 });
	}
	if (path === '/v1/refunds') {
		return new Response(
			JSON.stringify({ id: 're_test_1', status: 'succeeded', amount: 2000 }),
			{ status: 200 }
		);
	}
	return new Response(JSON.stringify({ error: { message: 'not mocked', type: 'invalid_request_error' } }), {
		status: 404
	});
};

const stores = createStoreService(db);
const commerce = createCommerce({
	db,
	store: (await stores.byId('shop')) as Store,
	stripe: { secretKey: 'sk_test_x', webhookSecret: SECRET, fetch: mockStripe }
});
const payments = commerce.payments!;

check('payments are null without config',
	createCommerce({ db, store: (await stores.byId('shop')) as Store }).payments, null);

const shipping = {
	email: 'buyer@example.com',
	firstName: 'Sam',
	lastName: 'Doe',
	address1: '1 Main St',
	city: 'Lisbon',
	postalCode: '1100',
	country: 'PT'
};

const order = await commerce.orders.create({
	lines: [{ variantId: seed.variantIds['TEE-1'], quantity: 2 }],
	method: 'express',
	shipping
});
check('order total is 2x2000 + 1200 shipping', order.totalCents, 5200);

// --- checkout session ---
const checkout = await payments.startCheckout({
	orderNumber: order.orderNumber,
	successUrl: 'https://shop.test/thanks',
	cancelUrl: 'https://shop.test/cart'
});
check(
	'checkout returns a hosted URL',
	checkout.url?.startsWith('https://checkout.stripe.com/'),
	true
);
check('hosted mode carries no client secret', checkout.clientSecret, null);

const sessionRequest = requests.find((r) => r.path === '/v1/checkout/sessions')!;
const body = decodeURIComponent(sessionRequest.body);
check('line item carries the unit price', body.includes('line_items[0][price_data][unit_amount]=2000'), true);
check('line item carries the quantity', body.includes('line_items[0][quantity]=2'), true);
check('shipping is its own line item', body.includes('line_items[1][price_data][unit_amount]=1200'), true);
check('order number travels as metadata', body.includes(`metadata[order_number]=${order.orderNumber}`), true);
check('store id travels as metadata', body.includes('metadata[store_id]=shop'), true);
check('metadata is copied onto the payment intent',
	body.includes(`payment_intent_data[metadata][order_number]=${order.orderNumber}`), true);
check('request is idempotent', sessionRequest.headers['idempotency-key'],
	`checkout:shop:${order.orderNumber}`);
check('secret key is sent as a bearer token',
	sessionRequest.headers['authorization'], 'Bearer sk_test_x');
check('payment row recorded as pending', (await payments.byOrderNumber(order.orderNumber))?.status, 'pending');

// --- webhooks ---
const webhook = async (event: unknown, opts: { secret?: string; now?: number } = {}) => {
	const raw = JSON.stringify(event);
	const header = await signStripePayload(opts.secret ?? SECRET, raw, opts.now ?? Math.floor(Date.now() / 1000));
	return payments.handleWebhook(raw, header);
};

const completed = (overrides: Record<string, unknown> = {}, id = 'evt_paid_1') => ({
	id,
	type: 'checkout.session.completed',
	data: {
		object: {
			id: checkout.sessionId,
			amount_total: 5200,
			currency: 'usd',
			client_reference_id: order.orderNumber,
			metadata: { order_number: order.orderNumber, store_id: 'shop' },
			...overrides
		}
	}
});

const forged = await payments.handleWebhook(JSON.stringify(completed()), 't=1,v1=deadbeef');
check('a forged signature is rejected', forged.handled === false && forged.reason, 'invalid_signature');

const unsigned = await payments.handleWebhook(JSON.stringify(completed()), null);
check('an unsigned request is rejected', unsigned.handled === false && unsigned.reason, 'invalid_signature');

const wrongSecret = await webhook(completed(), { secret: 'whsec_attacker' });
check('a signature from the wrong secret is rejected',
	wrongSecret.handled === false && wrongSecret.reason, 'invalid_signature');

const short = await webhook(completed({ amount_total: 100 }), {});
check('underpayment does not mark the order paid',
	short.handled === false && short.reason, 'amount_mismatch');
check('order still unpaid after underpayment',
	(await commerce.orders.byNumber(order.orderNumber))?.status, 'pending_payment');

const wrongCurrency = await webhook(completed({ currency: 'jpy' }, 'evt_ccy'), {});
check('a currency swap does not mark the order paid',
	wrongCurrency.handled === false && wrongCurrency.reason, 'amount_mismatch');

const otherStore = await webhook(
	completed({ metadata: { order_number: order.orderNumber, store_id: 'someone_else' } }, 'evt_tenant')
);
check('an event for another tenant is refused',
	otherStore.handled === false && otherStore.reason, 'wrong_store');

const paid = await webhook(completed({}, 'evt_paid_ok'));
check('a valid event marks the order paid', paid.handled === true && paid.action, 'order_paid');
check('order status is paid', (await commerce.orders.byNumber(order.orderNumber))?.status, 'paid');
check('payment status is succeeded', (await payments.byOrderNumber(order.orderNumber))?.status, 'succeeded');

const replay = await webhook(completed({}, 'evt_paid_ok'));
check('redelivery of the same event is a no-op',
	replay.handled === false && replay.reason, 'duplicate');

const concurrent = await Promise.all(
	Array.from({ length: 4 }, () => webhook(completed({}, 'evt_concurrent')))
);
check('concurrent redelivery applies exactly once',
	concurrent.filter((r) => r.handled).length, 1);

const ignored = await webhook({ id: 'evt_other', type: 'customer.created', data: { object: {} } });
check('unrelated event types are ignored', ignored.handled === false && ignored.reason, 'ignored');

check('stock is not restored for a paid order',
	(await commerce.catalog.findVariant(seed.productId, []))?.stock, 8);

const lateExpiry = await webhook({
	id: 'evt_expired_late',
	type: 'checkout.session.expired',
	data: {
		object: {
			id: checkout.sessionId,
			metadata: { order_number: order.orderNumber, store_id: 'shop' }
		}
	}
});
check('an expiry after payment does not restock',
	lateExpiry.handled === false && lateExpiry.reason, 'ignored');
check('stock unchanged by the late expiry',
	(await commerce.catalog.findVariant(seed.productId, []))?.stock, 8);

// --- abandoned checkout returns stock ---
const abandoned = await commerce.orders.create({
	lines: [{ variantId: seed.variantIds['TEE-1'], quantity: 3 }],
	method: 'standard',
	shipping
});
check('stock taken by the new order', (await commerce.catalog.findVariant(seed.productId, []))?.stock, 5);

const expired = await webhook({
	id: 'evt_expired',
	type: 'checkout.session.expired',
	data: {
		object: {
			id: 'cs_test_abandoned',
			metadata: { order_number: abandoned.orderNumber, store_id: 'shop' }
		}
	}
});
check('expiry releases the reserved stock',
	expired.handled === true && expired.action, 'stock_released:expired');
check('stock returned', (await commerce.catalog.findVariant(seed.productId, []))?.stock, 8);
check('order marked cancelled',
	(await commerce.orders.byNumber(abandoned.orderNumber))?.status, 'cancelled');

const expiredAgain = await webhook({
	id: 'evt_expired',
	type: 'checkout.session.expired',
	data: { object: { id: 'cs_test_abandoned', metadata: { order_number: abandoned.orderNumber, store_id: 'shop' } } }
});
check('a replayed expiry does not restock twice',
	expiredAgain.handled === false && expiredAgain.reason, 'duplicate');
check('stock still correct after replay',
	(await commerce.catalog.findVariant(seed.productId, []))?.stock, 8);

// --- refunds ---
const refund = await payments.refund({ orderNumber: order.orderNumber, reason: 'requested_by_customer' });
check('refund returns an id', refund.refundId, 're_test_1');
const refundRequest = requests.find((r) => r.path === '/v1/refunds')!;
// The payment row holds the Checkout Session id on the hosted path, and
// Stripe's refund endpoint only accepts an intent — so the session has to be
// exchanged first or every hosted order is unrefundable.
check('refund targets the payment intent, not the session',
	decodeURIComponent(refundRequest.body).includes('payment_intent=pi_test_1'), true);
check('refund is idempotent',
	refundRequest.headers['idempotency-key'], `refund:shop:${order.orderNumber}:full`);

let refundUnpaid = 'no error';
try {
	await payments.refund({ orderNumber: abandoned.orderNumber });
} catch (e) {
	refundUnpaid = (e as Error).message;
}
check('refunding an order that never paid is refused', refundUnpaid !== 'no error', true);

const refunded = await webhook({
	id: 'evt_refund',
	type: 'charge.refunded',
	data: { object: { id: 'ch_1', metadata: { order_number: order.orderNumber, store_id: 'shop' } } }
});
check('refund webhook releases stock',
	refunded.handled === true && refunded.action, 'stock_released:refunded');
check('order marked refunded',
	(await commerce.orders.byNumber(order.orderNumber))?.status, 'refunded');
check('refunded stock returned', (await commerce.catalog.findVariant(seed.productId, []))?.stock, 10);

// --- a discounted order must charge the discounted amount ----------------
// Line items sum to subtotal + shipping, and the webhook asserts the session
// total equals the order total. A bundle order without a coupon is therefore
// charged the full price and *then* refused — the worst of both.
{
	const store = (await stores.byId('shop')) as Store;
	const discounted = createCommerce({
		db,
		store,
		quantityBreaks: [{ minQuantity: 2, percentOff: 10 }],
		stripe: { secretKey: 'sk_test_x', webhookSecret: SECRET, fetch: mockStripe }
	});

	const order = await discounted.orders.create({
		lines: [{ variantId: seed.variantIds['TEE-1'], quantity: 2 }],
		method: 'standard',
		shipping: {
			email: 'bundle@example.com',
			firstName: 'B',
			lastName: 'T',
			address1: '1 St',
			city: 'Lisbon',
			postalCode: '1100',
			country: 'PT'
		},
		idempotencyKey: 'bundle-session-test'
	});

	check('a bundle order records its discount', order.discountCents > 0, true);
	check(
		'the order total is subtotal minus discount plus shipping',
		order.subtotalCents - order.discountCents + order.shippingCents,
		order.totalCents
	);

	requests.length = 0;
	await discounted.payments!.startCheckout({
		orderNumber: order.orderNumber,
		successUrl: 'https://shop.test/ok',
		cancelUrl: 'https://shop.test/no'
	});

	const coupon = requests.find((r) => r.path === '/v1/coupons');
	check('a coupon is created for the discount', Boolean(coupon), true);
	check(
		'the coupon is worth exactly the order discount',
		coupon ? new URLSearchParams(coupon.body).get('amount_off') : null,
		String(order.discountCents)
	);

	const session = requests.find((r) => r.path === '/v1/checkout/sessions');
	const params = new URLSearchParams(session?.body ?? '');
	check('the session applies the coupon', params.get('discounts[0][coupon]'), 'coupon_test_1');

	// The number Stripe will settle for, recomputed from what we actually sent.
	let lineTotal = 0;
	for (let i = 0; ; i += 1) {
		const amount = params.get(`line_items[${i}][price_data][unit_amount]`);
		if (amount === null) break;
		lineTotal += Number(amount) * Number(params.get(`line_items[${i}][quantity]`) ?? 1);
	}
	check(
		'line items minus the coupon equal the order total',
		lineTotal - order.discountCents,
		order.totalCents
	);
}


// --- the six events the endpoint actually subscribes to ------------------
// Everything above proves a session that settles immediately. These are the
// five other ways a payment ends, each of which leaves an order somewhere it
// cannot get out of on its own if the handler ignores it.

const buy = async (quantity = 1) =>
	commerce.orders.create({
		lines: [{ variantId: seed.variantIds['TEE-1'], quantity }],
		method: 'standard',
		shipping
	});

const stockNow = async () => (await commerce.catalog.findVariant(seed.productId, []))?.stock;

// A delayed method completes the session while the money is still clearing.
{
	const order = await buy();
	const session = await payments.startCheckout({
		orderNumber: order.orderNumber,
		successUrl: 'https://shop.test/thanks',
		cancelUrl: 'https://shop.test/cart'
	});
	const object = (overrides: Record<string, unknown>) => ({
		id: session.sessionId,
		amount_total: order.totalCents,
		currency: 'usd',
		metadata: { order_number: order.orderNumber, store_id: 'shop' },
		...overrides
	});

	const pending = await webhook({
		id: 'evt_delayed_open',
		type: 'checkout.session.completed',
		data: { object: object({ payment_status: 'unpaid' }) }
	});
	check('a completed session that is not paid does not fulfil',
		pending.handled === true && pending.action, 'payment_pending');
	check('the order stays pending while the payment clears',
		(await commerce.orders.byNumber(order.orderNumber))?.status, 'pending_payment');

	const cleared = await webhook({
		id: 'evt_delayed_cleared',
		type: 'checkout.session.async_payment_succeeded',
		data: { object: object({ payment_status: 'paid' }) }
	});
	check('the delayed payment clearing is what fulfils',
		cleared.handled === true && cleared.action, 'order_paid');
	check('and the order is paid', (await commerce.orders.byNumber(order.orderNumber))?.status, 'paid');
}

// A delayed method that fails leaves the order holding stock forever.
{
	const order = await buy();
	const before = await stockNow();
	const failed = await webhook({
		id: 'evt_delayed_failed',
		type: 'checkout.session.async_payment_failed',
		data: {
			object: {
				id: 'cs_test_failed',
				metadata: { order_number: order.orderNumber, store_id: 'shop' }
			}
		}
	});
	check('a failed delayed payment cancels the order',
		failed.handled === true && failed.action, 'stock_released:failed');
	check('the cancelled order is cancelled',
		(await commerce.orders.byNumber(order.orderNumber))?.status, 'cancelled');
	check('and its stock comes back', await stockNow(), (before ?? 0) + 1);
}

// A hosted session produces two events that both mean "paid". Only one of them
// may fulfil, or the conversion is reported twice and so is anything else the
// caller hangs off `order_paid`.
const twiceOrder = await buy();
{
	const session = await payments.startCheckout({
		orderNumber: twiceOrder.orderNumber,
		successUrl: 'https://shop.test/thanks',
		cancelUrl: 'https://shop.test/cart'
	});
	const first = await webhook({
		id: 'evt_twice_session',
		type: 'checkout.session.completed',
		data: {
			object: {
				id: session.sessionId,
				amount_total: twiceOrder.totalCents,
				currency: 'usd',
				payment_status: 'paid',
				metadata: { order_number: twiceOrder.orderNumber, store_id: 'shop' }
			}
		}
	});
	check('the session event fulfils', first.handled === true && first.action, 'order_paid');

	const second = await webhook({
		id: 'evt_twice_intent',
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: 'pi_twice',
				amount_received: twiceOrder.totalCents,
				currency: 'usd',
				metadata: { order_number: twiceOrder.orderNumber, store_id: 'shop' }
			}
		}
	});
	check('the intent event for the same order does not fulfil again',
		second.handled === true && second.action, 'already_paid');
}

// Refunds: how much came back decides whether the sale is undone.
{
	const charge = {
		id: 'ch_partial',
		payment_intent: 'pi_partial',
		amount: twiceOrder.totalCents,
		amount_refunded: 500,
		currency: 'usd',
		metadata: { order_number: twiceOrder.orderNumber, store_id: 'shop' }
	};
	const before = await stockNow();
	const partial = await webhook({
		id: 'evt_refund_partial',
		type: 'charge.refunded',
		data: { object: charge }
	});
	check('a partial refund is recorded as partial',
		partial.handled === true && partial.action, 'refund_partial');
	check('the order says so',
		(await commerce.orders.byNumber(twiceOrder.orderNumber))?.status, 'partially_refunded');
	check('a partial refund does not restock — the customer still has the goods',
		await stockNow(), before);

	const full = await webhook({
		id: 'evt_refund_full',
		type: 'charge.refunded',
		data: { object: { ...charge, amount_refunded: twiceOrder.totalCents, refunded: true } }
	});
	check('refunding the rest undoes the sale',
		full.handled === true && full.action, 'stock_released:refunded');
	check('and that one does restock', await stockNow(), (before ?? 0) + 1);
}

// A dispute has a deadline, so it has to reach a person with enough to act on.
{
	const order = await buy();
	await payments.startCheckout({
		orderNumber: order.orderNumber,
		successUrl: 'https://shop.test/thanks',
		cancelUrl: 'https://shop.test/cart'
	});
	await webhook({
		id: 'evt_disputed_paid',
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: 'pi_disputed',
				amount_received: order.totalCents,
				currency: 'usd',
				metadata: { order_number: order.orderNumber, store_id: 'shop' }
			}
		}
	});
	charges['ch_disputed'] = {
		id: 'ch_disputed',
		payment_intent: 'pi_disputed',
		amount: order.totalCents,
		amount_refunded: 0,
		currency: 'usd',
		metadata: { order_number: order.orderNumber, store_id: 'shop' }
	};

	const dispute = await webhook({
		id: 'evt_dispute',
		type: 'charge.dispute.created',
		data: {
			object: {
				id: 'dp_1',
				charge: 'ch_disputed',
				amount: order.totalCents,
				currency: 'usd',
				reason: 'fraudulent',
				status: 'needs_response',
				evidence_details: { due_by: 1790000000 }
			}
		}
	});
	check('a dispute flags the order', dispute.handled === true && dispute.action, 'dispute_opened');
	check('the order is marked disputed',
		(await commerce.orders.byNumber(order.orderNumber))?.status, 'disputed');
	check('the alert carries the evidence deadline',
		dispute.handled === true && dispute.detail?.includes('evidence due'), true);
	check('and the reason the bank gave',
		dispute.handled === true && dispute.detail?.includes('fraudulent'), true);
}

// An early fraud warning arrives before any dispute, references only a charge,
// and — on the on-page path — the charge's intent is what the payment row holds.
{
	const order = await buy();
	const intent = await payments.startPayment({ orderNumber: order.orderNumber });
	await webhook({
		id: 'evt_efw_paid',
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: intent.paymentIntentId,
				amount_received: order.totalCents,
				currency: 'usd',
				metadata: { order_number: order.orderNumber, store_id: 'shop' }
			}
		}
	});
	// Deliberately no order_number on the charge: this is the path where the
	// order has to be recovered from the payment row via the intent.
	charges['ch_efw'] = {
		id: 'ch_efw',
		payment_intent: intent.paymentIntentId,
		amount: order.totalCents,
		amount_refunded: 0,
		currency: 'usd',
		metadata: {}
	};

	const refundsBefore = requests.filter((r) => r.path === '/v1/refunds').length;
	const warning = await webhook({
		id: 'evt_efw',
		type: 'radar.early_fraud_warning.created',
		data: { object: { id: 'issfr_1', charge: 'ch_efw', fraud_type: 'made_with_stolen_card', actionable: true } }
	});
	check('a fraud warning flags the order', warning.handled === true && warning.action, 'fraud_warning');
	check('the order was found from the charge alone',
		warning.handled === true && warning.orderNumber, order.orderNumber);
	check('the order is marked flagged',
		(await commerce.orders.byNumber(order.orderNumber))?.status, 'fraud_warning');
	check('nothing is refunded without an explicit decision',
		requests.filter((r) => r.path === '/v1/refunds').length, refundsBefore);
	check('and the alert says so',
		warning.handled === true && warning.detail?.includes('auto-refund off'), true);
}

// The same warning, for a store that has opted into refunding on one.
{
	const store = (await stores.byId('shop')) as Store;
	const eager = createCommerce({
		db,
		store,
		stripe: { secretKey: 'sk_test_x', webhookSecret: SECRET, fetch: mockStripe },
		payments: { autoRefundOnFraudWarning: true }
	});
	const order = await eager.orders.create({
		lines: [{ variantId: seed.variantIds['TEE-1'], quantity: 1 }],
		method: 'standard',
		shipping
	});
	const intent = await eager.payments!.startPayment({ orderNumber: order.orderNumber });
	const eagerHook = async (event: unknown) => {
		const raw = JSON.stringify(event);
		return eager.payments!.handleWebhook(
			raw,
			await signStripePayload(SECRET, raw, Math.floor(Date.now() / 1000))
		);
	};
	await eagerHook({
		id: 'evt_efw2_paid',
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: intent.paymentIntentId,
				amount_received: order.totalCents,
				currency: 'usd',
				metadata: { order_number: order.orderNumber, store_id: 'shop' }
			}
		}
	});
	charges['ch_efw2'] = {
		id: 'ch_efw2',
		payment_intent: intent.paymentIntentId,
		amount: order.totalCents,
		amount_refunded: 0,
		currency: 'usd',
		metadata: { order_number: order.orderNumber, store_id: 'shop' }
	};

	const refundsBefore = requests.filter((r) => r.path === '/v1/refunds').length;
	const warning = await eagerHook({
		id: 'evt_efw2',
		type: 'radar.early_fraud_warning.created',
		data: { object: { id: 'issfr_2', charge: 'ch_efw2', fraud_type: 'made_with_stolen_card' } }
	});
	check('with the flag on, the warning refunds',
		requests.filter((r) => r.path === '/v1/refunds').length, refundsBefore + 1);
	check('the refund is marked fraudulent',
		decodeURIComponent(requests.filter((r) => r.path === '/v1/refunds').pop()?.body ?? '')
			.includes('reason=fraudulent'), true);
	check('and the order is still flagged for a person to look at',
		warning.handled === true && warning.action, 'fraud_warning');
}

// Redelivery of any of them is a no-op — Stripe retries all six the same way.
{
	const replayed = await webhook({
		id: 'evt_dispute',
		type: 'charge.dispute.created',
		data: { object: { id: 'dp_1', charge: 'ch_disputed', amount: 100, currency: 'usd' } }
	});
	check('a redelivered dispute is recognised as a duplicate',
		replayed.handled === false && replayed.reason, 'duplicate');
}

db.close();
await rm(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : '\nPayments hold.');
process.exitCode = failures ? 1 : 0;
