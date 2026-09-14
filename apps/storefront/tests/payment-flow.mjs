/**
 * End-to-end payment flow against a mock Stripe.
 *
 * Runs the real routes — checkout action, webhook, success page — with
 * STRIPE_API_BASE pointed at a local server, so the whole path from "place
 * order" to "order paid" is exercised without a Stripe account and without
 * charging anything. Live keys can never make this test pass differently.
 *
 *   node tests/payment-flow.mjs
 *
 * Expects a dev server started with the same STRIPE_* env vars. See
 * `npm run test:payments`.
 */
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
// Event ids are deduped forever in the payments table, so a fixed id would make
// every run after the first a no-op that still looks like a pass.
const RUN = Date.now().toString(36);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret';
const MOCK_PORT = Number(process.env.STRIPE_MOCK_PORT ?? 12111);
const CAPI_PORT = Number(process.env.CAPI_MOCK_PORT ?? 12112);

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

// --- mock Stripe -----------------------------------------------------------
// Only the two calls the checkout path makes. Records them so the test can
// assert on what we actually sent, which is where the real bugs live.
const seen = [];
// Stripe objects the charge-shaped events only point at.
const charges = {};
const intents = {};
const mock = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		seen.push({ path: req.url, body, auth: req.headers.authorization ?? '' });
		if (req.url === '/v1/coupons') {
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ id: 'coupon_mock_1' }));
			return;
		}
		// A dispute and an early fraud warning reference a charge rather than
		// carrying the order, so the handler retrieves it to find the order.
		if (req.url.startsWith('/v1/charges/')) {
			const id = decodeURIComponent(req.url.slice('/v1/charges/'.length));
			res.writeHead(charges[id] ? 200 : 404, { 'content-type': 'application/json' });
			res.end(JSON.stringify(charges[id] ?? { error: { message: `no charge ${id}` } }));
			return;
		}
		if (req.url.startsWith('/v1/payment_intents/')) {
			const id = decodeURIComponent(req.url.slice('/v1/payment_intents/'.length));
			res.writeHead(intents[id] ? 200 : 404, { 'content-type': 'application/json' });
			res.end(JSON.stringify(intents[id] ?? { error: { message: `no intent ${id}` } }));
			return;
		}
		if (req.url === '/v1/payment_intents') {
			const params = new URLSearchParams(body);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(
				JSON.stringify({
					id: `pi_test_mock_${RUN}`,
					client_secret: `pi_test_mock_${RUN}_secret`,
					amount: Number(params.get('amount')),
					currency: params.get('currency'),
					status: 'requires_payment_method'
				})
			);
			return;
		}
		if (req.url === '/v1/checkout/sessions') {
			const params = new URLSearchParams(body);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(
				JSON.stringify({
					id: 'cs_test_mock_1',
					url: params.get('ui_mode') === 'embedded' ? null : `${BASE}/__stripe-hosted-page`,
					client_secret: params.get('ui_mode') === 'embedded' ? 'cs_test_mock_1_secret' : null,
					status: 'open',
					amount_total: null,
					currency: params.get('line_items[0][price_data][currency]')
				})
			);
			return;
		}
		res.writeHead(404, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ error: { message: `unmocked ${req.url}` } }));
	});
});
await new Promise((resolve) => mock.listen(MOCK_PORT, '127.0.0.1', resolve));

// --- mock Meta Conversions API --------------------------------------------
// Stands in for graph.facebook.com so the test can assert on the conversion we
// report without sending anything to a real ad account.
const capiEvents = [];
const capi = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		capiEvents.push({ path: req.url, body });
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ events_received: 1, messages: [] }));
	});
});
await new Promise((resolve) => capi.listen(CAPI_PORT, '127.0.0.1', resolve));

const capiPurchases = () =>
	capiEvents
		.map((e) => {
			try {
				return JSON.parse(e.body).data?.[0] ?? null;
			} catch {
				return null;
			}
		})
		.filter((e) => e?.event_name === 'Purchase');

const settle = () => new Promise((r) => setTimeout(r, 2000));

// The webhook is a request from Stripe, so anything Meta matches on has to be
// captured from the buyer's own request and carried through. A recognisable
// value here is what makes that round trip assertable.
const UA = 'Mozilla/5.0 (payflow-test) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

// --- place an order --------------------------------------------------------
const product = await fetch(`${BASE}/products/dog-life-jacket`).then((r) => r.text());
// The page ships a variant index for the host's own submit handler — colour to
// variant id — which is the only place a real id appears in the markup now.
const variant = Number(/variantId["'\s:]+(\d+)/.exec(product)?.[1] ?? 0) || null;
check('found a variant to buy', Boolean(variant), 'could not parse a variant id from the page');

const form = new URLSearchParams({
	email: 'payflow@example.com',
	firstName: 'Pay',
	lastName: 'Flow',
	address1: '1 Test St',
	city: 'Lisbon',
	province: 'CA',
	postalCode: '94103',
	country: 'US',
	method: 'standard',
	cardReady: '0',
	submissionId: `payflow-${Date.now()}`,
	lines: JSON.stringify([{ variantId: variant, quantity: 1 }])
});

const placed = await fetch(`${BASE}/checkout`, {
	method: 'POST',
	redirect: 'manual',
	headers: {
		'content-type': 'application/x-www-form-urlencoded',
		origin: BASE,
		'user-agent': UA,
		cookie: '_fbp=fb.1.1700000000000.1234567890; _fbc=fb.1.1700000000000.testclickid'
	},
	body: form
});

const payload = await placed.json().catch(() => null);
// SvelteKit form actions report a redirect in the JSON envelope, not as a 303.
const redirectLocation =
	placed.headers.get('location') ?? (payload?.type === 'redirect' ? payload.location : null);

check(
	'checkout redirects to the payment page',
	redirectLocation === `${BASE}/__stripe-hosted-page`,
	`got ${placed.status} ${redirectLocation ?? JSON.stringify(payload)?.slice(0, 200)}`
);

const sessionCall = seen.find((c) => c.path === '/v1/checkout/sessions');
check('a checkout session was created', Boolean(sessionCall));

if (sessionCall) {
	const p = new URLSearchParams(sessionCall.body);
	const orderNumber = p.get('client_reference_id');

	check('session is a one-off payment', p.get('mode') === 'payment');
	check('order number travels as client_reference_id', /^CMP-/.test(orderNumber ?? ''));
	check('store id is in metadata for tenant routing', p.get('metadata[store_id]') === 'chillmypet');
	check(
		'success url points at our confirmation route',
		(p.get('success_url') ?? '').startsWith(`${BASE}/checkout/success?order=CMP-`)
	);
	check(
		'cancel url returns to checkout, not the confirmation',
		(p.get('cancel_url') ?? '').startsWith(`${BASE}/checkout?cancelled=`)
	);
	check(
		'meta click identifiers ride along for the webhook',
		p.get('metadata[fbp]') === 'fb.1.1700000000000.1234567890' &&
			p.get('metadata[fbc]') === 'fb.1.1700000000000.testclickid'
	);
	check(
		'so do the buyer\'s IP and user agent',
		Boolean(p.get('metadata[client_ip]')) && p.get('metadata[client_ua]') === UA,
		`ip=${p.get('metadata[client_ip]')} ua=${p.get('metadata[client_ua]')}`
	);
	check(
		'and nothing exceeds what Stripe stores in a metadata value',
		[...p.entries()]
			.filter(([k]) => k.startsWith('metadata['))
			.every(([, v]) => v.length <= 500)
	);
	check('the secret key is sent as a bearer token', sessionCall.auth.startsWith('Bearer sk_'));
	check(
		'the card statement carries a descriptor the buyer will recognise',
		p.get('payment_intent_data[statement_descriptor]') === 'CHILLMYPET',
		`got ${p.get('payment_intent_data[statement_descriptor]')} — an unrecognised descriptor is a chargeback`
	);

	// --- the order must not look sold yet ---------------------------------
	const beforeHtml = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`
	).then((r) => r.text());
	check(
		'before payment the page does not claim payment was received',
		!/Payment received/i.test(beforeHtml) && /processing/i.test(beforeHtml),
		'an unpaid order rendered as paid'
	);

	await settle();
	check(
		'placing an order reports no conversion on its own',
		capiPurchases().length === 0,
		`${capiPurchases().length} Purchase event(s) fired before any money moved`
	);

	// --- an unsigned webhook must be rejected -----------------------------
	const totalCents = Number(p.get('line_items[0][price_data][unit_amount]'));
	const shipping = Number(p.get('line_items[1][price_data][unit_amount]') ?? 0) || 0;
	const amountTotal = totalCents + shipping;

	const event = (id) =>
		JSON.stringify({
			id,
			type: 'checkout.session.completed',
			data: {
				object: {
					id: 'cs_test_mock_1',
					client_reference_id: orderNumber,
					amount_total: amountTotal,
					currency: 'usd',
					// Echoed exactly as Stripe echoes it, off the create call above,
					// so the round trip being asserted is the real one rather than
					// a fixture that happens to agree with the handler.
					metadata: Object.fromEntries(
						[...p.entries()]
							.filter(([k]) => k.startsWith('metadata['))
							.map(([k, v]) => [k.slice('metadata['.length, -1), v])
					)
				}
			}
		});

	const forged = event(`evt_forged_${RUN}`);
	const unsigned = await fetch(`${BASE}/api/stripe/webhook`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
		body: forged
	});
	check('an unsigned webhook is rejected', unsigned.status === 400, `got ${unsigned.status}`);

	const stillUnpaid = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`
	).then((r) => r.text());
	check('a forged webhook did not mark the order paid', !/Payment received/i.test(stillUnpaid));

	// --- the real thing ---------------------------------------------------
	const body = event(`evt_paid_${RUN}`);
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac('sha256', WEBHOOK_SECRET)
		.update(`${timestamp}.${body}`)
		.digest('hex');

	const hook = await fetch(`${BASE}/api/stripe/webhook`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': `t=${timestamp},v1=${signature}`
		},
		body
	});
	const outcome = await hook.json();
	check('a signed webhook is accepted', hook.status === 200, `got ${hook.status}`);
	check('it marks the order paid', outcome.handled && outcome.action === 'order_paid', JSON.stringify(outcome));

	await settle();
	const purchases = capiPurchases();
	check('payment reports exactly one conversion', purchases.length === 1, `got ${purchases.length}`);

	const purchase = purchases[0];
	if (purchase) {
		check(
			'the conversion id matches the one the browser will send',
			purchase.event_id === `purchase-${orderNumber}`,
			purchase.event_id
		);
		check(
			'it reports the amount actually paid',
			purchase.custom_data?.value === (amountTotal / 100).toFixed(2),
			`${purchase.custom_data?.value} vs ${(amountTotal / 100).toFixed(2)}`
		);
		check('email is hashed, never raw', /^[a-f0-9]{64}$/.test(purchase.user_data?.em?.[0] ?? ''));
		check(
			'no raw customer data reached Meta',
			!JSON.stringify(purchase).toLowerCase().includes('payflow@example.com'),
			'raw email in the payload'
		);
		check(
			'the click identifiers survived the round trip through Stripe',
			purchase.user_data?.fbp === 'fb.1.1700000000000.1234567890' &&
				purchase.user_data?.fbc === 'fb.1.1700000000000.testclickid',
			JSON.stringify({ fbp: purchase.user_data?.fbp, fbc: purchase.user_data?.fbc })
		);
		check(
			'address fields from our own order row are matched on',
			Boolean(purchase.user_data?.zp && purchase.user_data?.ct && purchase.user_data?.ln),
			'advanced matching lost the address when Purchase moved to the webhook'
		);
		check(
			'the browser IP and user agent survived too, unhashed',
			purchase.user_data?.client_user_agent === UA &&
				Boolean(purchase.user_data?.client_ip_address),
			JSON.stringify({
				ua: purchase.user_data?.client_user_agent,
				ip: purchase.user_data?.client_ip_address
			})
		);
		check(
			'and Stripe\'s own address is not what got reported',
			!/Stripe/i.test(purchase.user_data?.client_user_agent ?? ''),
			'the webhook request\'s own user agent reached Meta'
		);
	}

	// --- redelivery is a no-op -------------------------------------------
	const replay = await fetch(`${BASE}/api/stripe/webhook`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': `t=${timestamp},v1=${signature}`
		},
		body
	});
	const replayOutcome = await replay.json();
	check('redelivery answers 2xx so Stripe stops retrying', replay.status === 200);
	check(
		'redelivery is recognised as a duplicate',
		!replayOutcome.handled && replayOutcome.reason === 'duplicate',
		JSON.stringify(replayOutcome)
	);

	await settle();
	check(
		'a redelivered event does not report the sale twice',
		capiPurchases().length === 1,
		`${capiPurchases().length} Purchase events after redelivery`
	);

	// --- underpayment must not settle an order ----------------------------
	const shortBody = JSON.stringify({
		id: `evt_short_${RUN}`,
		type: 'checkout.session.completed',
		data: {
			object: {
				id: 'cs_test_mock_short',
				client_reference_id: orderNumber,
				amount_total: 1,
				currency: 'usd',
				metadata: { store_id: 'chillmypet', order_number: orderNumber }
			}
		}
	});
	const shortSig = createHmac('sha256', WEBHOOK_SECRET)
		.update(`${timestamp}.${shortBody}`)
		.digest('hex');
	const short = await fetch(`${BASE}/api/stripe/webhook`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': `t=${timestamp},v1=${shortSig}`
		},
		body: shortBody
	});
	const shortOutcome = await short.json();
	check(
		'paying less than the total is refused',
		!shortOutcome.handled && shortOutcome.reason === 'amount_mismatch',
		JSON.stringify(shortOutcome)
	);

	// --- the confirmation now reflects a real payment ---------------------
	const afterHtml = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`
	).then((r) => r.text());
	check('after payment the confirmation says so', /Payment received/i.test(afterHtml));
	check(
		'the confirmation carries the deduplicating event id',
		afterHtml.includes(`purchase-${orderNumber}`),
		'browser Purchase would be counted separately from the CAPI one'
	);
	check(
		'the confirmation does not leak the shipping address',
		!afterHtml.includes('1 Test St'),
		'order lookup is by guessable order number, so it must stay receipt-only'
	);

	const missing = await fetch(`${BASE}/checkout/success?order=CMP-DOESNOTEXIST`);
	check('an unknown order 404s rather than rendering', missing.status === 404, `got ${missing.status}`);
}

// --- the inline card path --------------------------------------------------
// What the checkout's own form posts, in the field names the blocks write —
// one name field rather than two, and the card already mounted. The action answers with
// an intent to confirm against instead of somewhere else to go, so a rename on
// that page fails here rather than in production.
{
	const submissionId = `inline-${RUN}`;
	const inline = new URLSearchParams({
		email: 'inline@example.com',
		fullName: 'Inline Buyer',
		address1: '2 Test St',
		city: 'Delta',
		province: 'BC',
		postalCode: 'V3W 3N1',
		country: 'CA',
		method: 'express',
		cardReady: '1',
		submissionId,
		// Two units, which is a bundle discount — the figure the intent charges
		// has to be the discounted one.
		lines: JSON.stringify([{ variantId: variant, quantity: 2 }])
	});

	const placed = await fetch(`${BASE}/checkout`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			origin: BASE,
			cookie: '_fbp=fb.1.1700000000000.1234567890'
		},
		body: inline
	});
	const raw = await placed.text();

	check(
		'the inline checkout answers with an intent, not a redirect',
		placed.status === 200 && raw.includes(`pi_test_mock_${RUN}_secret`),
		`${placed.status} ${raw.slice(0, 200)}`
	);

	const intentCall = seen.find((c) => c.path === '/v1/payment_intents');
	check('a payment intent was created', Boolean(intentCall));

	if (intentCall) {
		const p = new URLSearchParams(intentCall.body);
		// 2 × $44.97 = $89.94, less the 7% two-pack break ($6.30), plus $12
		// express. The intent is the order total outright, so unlike the hosted
		// session there is no coupon to reconcile — which is exactly why the
		// discount has to already be in this number.
		check(
			'the intent charges the discounted total, not the list price',
			Number(p.get('amount')) === 8994 - 630 + 1200,
			`charged ${p.get('amount')} for an order worth ${8994 - 630 + 1200}`
		);
		check('the order number travels with the intent', /^CMP-/.test(p.get('metadata[order_number]') ?? ''));
		check('store id is in metadata for tenant routing', p.get('metadata[store_id]') === 'chillmypet');
		check(
			'the click identifier rides along for the webhook',
			p.get('metadata[fbp]') === 'fb.1.1700000000000.1234567890'
		);
		check(
			'the card statement carries a descriptor the buyer will recognise',
			p.get('statement_descriptor') === 'CHILLMYPET',
			`got ${p.get('statement_descriptor')}`
		);

		// --- an intent that succeeds settles the order ---------------------
		const orderNumber = p.get('metadata[order_number]');
		const paidBody = JSON.stringify({
			id: `evt_intent_${RUN}`,
			type: 'payment_intent.succeeded',
			data: {
				object: {
					id: `pi_test_mock_${RUN}`,
					amount_received: Number(p.get('amount')),
					currency: 'usd',
					metadata: {
						store_id: 'chillmypet',
						order_number: orderNumber,
						fbp: 'fb.1.1700000000000.1234567890'
					}
				}
			}
		});
		const ts = Math.floor(Date.now() / 1000);
		const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${paidBody}`).digest('hex');
		const hook = await fetch(`${BASE}/api/stripe/webhook`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'stripe-signature': `t=${ts},v1=${sig}`
			},
			body: paidBody
		});
		const outcome = await hook.json();
		check(
			'a succeeded intent marks the order paid',
			outcome.handled && outcome.action === 'order_paid',
			JSON.stringify(outcome)
		);

		await settle();
		const purchase = capiPurchases().find((e) => e.event_id === `purchase-${orderNumber}`);
		check('the inline sale reports its own conversion', Boolean(purchase));
		check(
			'for the amount actually charged',
			purchase?.custom_data?.value === (Number(p.get('amount')) / 100).toFixed(2),
			`${purchase?.custom_data?.value} vs ${(Number(p.get('amount')) / 100).toFixed(2)}`
		);
	}
}

// --- the other five events the endpoint subscribes to ---------------------
// Each one leaves an order somewhere it cannot get out of on its own if the
// handler ignores it, and two of them are the ones that cost money.
{
	const post = async (event) => {
		const body = JSON.stringify(event);
		const ts = Math.floor(Date.now() / 1000);
		const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${body}`).digest('hex');
		const response = await fetch(`${BASE}/api/stripe/webhook`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'stripe-signature': `t=${ts},v1=${sig}`
			},
			body
		});
		return { status: response.status, outcome: await response.json().catch(() => null) };
	};

	const place = async (submissionId) => {
		const body = new URLSearchParams({
			email: 'events@example.com',
			firstName: 'Event',
			lastName: 'Case',
			address1: '3 Test St',
			city: 'Lisbon',
			province: 'CA',
			postalCode: '94103',
			country: 'US',
			method: 'standard',
			cardReady: '0',
			submissionId,
			lines: JSON.stringify([{ variantId: variant, quantity: 1 }])
		});
		await fetch(`${BASE}/checkout`, {
			method: 'POST',
			redirect: 'manual',
			headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
			body
		});
		const session = seen.filter((c) => c.path === '/v1/checkout/sessions').pop();
		const params = new URLSearchParams(session.body);
		return {
			orderNumber: params.get('client_reference_id'),
			amountTotal: [...params.entries()]
				.filter(([k]) => /^line_items\[\d+\]\[price_data\]\[unit_amount\]$/.test(k))
				.reduce((sum, [k, v]) => {
					const index = k.match(/^line_items\[(\d+)\]/)[1];
					return sum + Number(v) * Number(params.get(`line_items[${index}][quantity]`) ?? 1);
				}, 0)
		};
	};

	// A delayed payment method completes the session while the money is still
	// clearing. Fulfilling there ships goods against a payment that can fail.
	const delayed = await place(`delayed-${RUN}`);
	const pending = await post({
		id: `evt_unpaid_${RUN}`,
		type: 'checkout.session.completed',
		data: {
			object: {
				id: 'cs_test_mock_1',
				client_reference_id: delayed.orderNumber,
				amount_total: delayed.amountTotal,
				currency: 'usd',
				payment_status: 'unpaid',
				metadata: { store_id: 'chillmypet', order_number: delayed.orderNumber }
			}
		}
	});
	check(
		'a completed session that is not paid does not fulfil',
		pending.status === 200 && pending.outcome?.action === 'payment_pending',
		JSON.stringify(pending.outcome)
	);
	const stillProcessing = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(delayed.orderNumber)}`
	).then((r) => r.text());
	check(
		'and the receipt still says processing',
		!/Payment received/i.test(stillProcessing),
		'an order whose payment had not cleared rendered as paid'
	);

	await settle();
	const beforeFailure = capiPurchases().length;

	// ...and when it never clears, the order has to be let go of. Without this
	// it holds stock forever and the customer never hears anything.
	const failed = await post({
		id: `evt_failed_${RUN}`,
		type: 'checkout.session.async_payment_failed',
		data: {
			object: {
				id: 'cs_test_mock_1',
				client_reference_id: delayed.orderNumber,
				metadata: { store_id: 'chillmypet', order_number: delayed.orderNumber }
			}
		}
	});
	check(
		'a failed delayed payment cancels the order and returns its stock',
		failed.status === 200 && failed.outcome?.action === 'stock_released:failed',
		JSON.stringify(failed.outcome)
	);

	await settle();
	check(
		'none of that reported a conversion',
		capiPurchases().length === beforeFailure,
		'a payment that never arrived was reported as a sale'
	);

	// A paid order to run the money-losing events against.
	const sold = await place(`sold-${RUN}`);
	const paid = await post({
		id: `evt_sold_${RUN}`,
		type: 'checkout.session.completed',
		data: {
			object: {
				id: 'cs_test_mock_1',
				client_reference_id: sold.orderNumber,
				amount_total: sold.amountTotal,
				currency: 'usd',
				payment_status: 'paid',
				metadata: { store_id: 'chillmypet', order_number: sold.orderNumber }
			}
		}
	});
	check('the paid session fulfils', paid.outcome?.action === 'order_paid', JSON.stringify(paid.outcome));

	await settle();
	const afterSale = capiPurchases().length;

	// A hosted session produces `payment_intent.succeeded` as well, because the
	// session copies its metadata onto the intent. Both mean the same sale, so
	// only the first may fulfil — otherwise every hosted order is reported twice.
	const second = await post({
		id: `evt_sold_intent_${RUN}`,
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: `pi_sold_${RUN}`,
				amount_received: sold.amountTotal,
				currency: 'usd',
				metadata: { store_id: 'chillmypet', order_number: sold.orderNumber }
			}
		}
	});
	check(
		'the intent event for an order already paid does not fulfil again',
		second.status === 200 && second.outcome?.action === 'already_paid',
		JSON.stringify(second.outcome)
	);
	await settle();
	check(
		'and reports no second conversion for the one sale',
		capiPurchases().length === afterSale,
		`${capiPurchases().length - afterSale} extra Purchase event(s)`
	);

	// The charge behind that order, for the two events that only reference one.
	charges[`ch_${RUN}`] = {
		id: `ch_${RUN}`,
		payment_intent: `pi_sold_${RUN}`,
		amount: sold.amountTotal,
		amount_refunded: 0,
		currency: 'usd',
		metadata: { store_id: 'chillmypet', order_number: sold.orderNumber }
	};

	const warning = await post({
		id: `evt_efw_${RUN}`,
		type: 'radar.early_fraud_warning.created',
		data: {
			object: {
				id: `issfr_${RUN}`,
				charge: `ch_${RUN}`,
				fraud_type: 'made_with_stolen_card',
				actionable: true
			}
		}
	});
	check(
		'an early fraud warning finds the order from the charge alone',
		warning.status === 200 && warning.outcome?.action === 'fraud_warning',
		JSON.stringify(warning.outcome)
	);
	check(
		'and nothing is refunded without an explicit decision',
		(warning.outcome?.detail ?? '').includes('auto-refund off'),
		warning.outcome?.detail
	);

	const dispute = await post({
		id: `evt_dispute_${RUN}`,
		type: 'charge.dispute.created',
		data: {
			object: {
				id: `dp_${RUN}`,
				charge: `ch_${RUN}`,
				amount: sold.amountTotal,
				currency: 'usd',
				reason: 'fraudulent',
				status: 'needs_response',
				evidence_details: { due_by: Math.floor(Date.now() / 1000) + 10 * 86400 }
			}
		}
	});
	check(
		'a dispute flags the order',
		dispute.status === 200 && dispute.outcome?.action === 'dispute_opened',
		JSON.stringify(dispute.outcome)
	);
	check(
		'with the evidence deadline in the alert',
		(dispute.outcome?.detail ?? '').includes('evidence due'),
		dispute.outcome?.detail
	);

	const partial = await post({
		id: `evt_partial_${RUN}`,
		type: 'charge.refunded',
		data: {
			object: {
				id: `ch_${RUN}`,
				payment_intent: `pi_sold_${RUN}`,
				amount: sold.amountTotal,
				amount_refunded: 500,
				currency: 'usd',
				metadata: { store_id: 'chillmypet', order_number: sold.orderNumber }
			}
		}
	});
	check(
		'a partial refund is not treated as the sale being undone',
		partial.status === 200 && partial.outcome?.action === 'refund_partial',
		JSON.stringify(partial.outcome)
	);

	const full = await post({
		id: `evt_full_${RUN}`,
		type: 'charge.refunded',
		data: {
			object: {
				id: `ch_${RUN}`,
				payment_intent: `pi_sold_${RUN}`,
				amount: sold.amountTotal,
				amount_refunded: sold.amountTotal,
				refunded: true,
				currency: 'usd',
				metadata: { store_id: 'chillmypet', order_number: sold.orderNumber }
			}
		}
	});
	check(
		'refunding the rest does undo it',
		full.status === 200 && full.outcome?.action === 'stock_released:refunded',
		JSON.stringify(full.outcome)
	);

	await settle();
	check(
		'and none of the five reported a conversion',
		capiPurchases().length === afterSale,
		'a refund, a dispute or a fraud warning was reported to Meta as a sale'
	);

	// An event type the store does not handle must still answer 2xx. A 500 buys
	// days of retries for something nobody was going to read.
	const unknown = await post({
		id: `evt_unknown_${RUN}`,
		type: 'customer.subscription.updated',
		data: { object: { id: 'sub_1' } }
	});
	check(
		'an unrecognised event type is answered, not retried',
		unknown.status === 200 && unknown.outcome?.reason === 'ignored',
		`${unknown.status} ${JSON.stringify(unknown.outcome)}`
	);
}

mock.close();
capi.close();
console.log(failures === 0 ? '\nPayment flow OK.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
