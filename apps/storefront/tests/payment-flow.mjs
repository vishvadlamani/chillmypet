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
// Real objects rather than fixed responses: the app now reads state back off
// Stripe as well as writing to it, so a GET has to return what the matching
// POST created. Flipping an intent to `succeeded` here is how the test stands
// in for a customer finishing the card form.
const intents = new Map();
const sessions = new Map();
let intentSeq = 0;

const mock = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		seen.push({ path: req.url, method: req.method, body, auth: req.headers.authorization ?? '' });
		const json = (payload, status = 200) => {
			res.writeHead(status, { 'content-type': 'application/json' });
			res.end(JSON.stringify(payload));
		};

		if (req.url === '/v1/coupons') return json({ id: 'coupon_mock_1' });

		if (req.url === '/v1/payment_intents') {
			const params = new URLSearchParams(body);
			// Unique per creation, like the real thing. A fixed id would let a
			// second order collide with the first on (provider, provider_ref) and
			// quietly settle the wrong one.
			const id = `pi_test_mock_${RUN}_${++intentSeq}`;
			const intent = {
				id,
				client_secret: `${id}_secret`,
				amount: Number(params.get('amount')),
				amount_received: 0,
				currency: params.get('currency'),
				status: 'requires_payment_method'
			};
			intents.set(id, intent);
			return json(intent);
		}

		if (req.url.startsWith('/v1/payment_intents/')) {
			const id = decodeURIComponent(req.url.slice('/v1/payment_intents/'.length));
			const intent = intents.get(id);
			return intent ? json(intent) : json({ error: { message: `no such intent ${id}` } }, 404);
		}

		if (req.url === '/v1/checkout/sessions') {
			const params = new URLSearchParams(body);
			const session = {
				id: 'cs_test_mock_1',
				url: params.get('ui_mode') === 'embedded' ? null : `${BASE}/__stripe-hosted-page`,
				client_secret: params.get('ui_mode') === 'embedded' ? 'cs_test_mock_1_secret' : null,
				status: 'open',
				// Open sessions have no intent yet, which is what stops a
				// reconcile settling an order nobody has paid for.
				payment_intent: null,
				amount_total: null,
				currency: params.get('line_items[0][price_data][currency]')
			};
			sessions.set(session.id, session);
			return json(session);
		}

		if (req.url.startsWith('/v1/checkout/sessions/')) {
			const id = decodeURIComponent(req.url.slice('/v1/checkout/sessions/'.length));
			const session = sessions.get(id);
			return session ? json(session) : json({ error: { message: `no such session ${id}` } }, 404);
		}

		json({ error: { message: `unmocked ${req.url}` } }, 404);
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
					metadata: {
						store_id: 'chillmypet',
						order_number: orderNumber,
						fbp: 'fb.1.1700000000000.1234567890',
						fbc: 'fb.1.1700000000000.testclickid'
					}
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

	const intentId = /(pi_test_mock_[A-Za-z0-9]+_\d+)_secret/.exec(raw)?.[1];
	check(
		'the inline checkout answers with an intent, not a redirect',
		placed.status === 200 && Boolean(intentId),
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
					id: intentId,
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

// --- a sale nobody told us about -------------------------------------------
// The webhook is one delivery away from silence, and none of the ways it goes
// quiet are visible from inside the app: an endpoint subscribed to the wrong
// events (this store's was set up for `checkout.session.completed`, which the
// inline card form never fires), a rotated secret, an outage. The card is
// charged and the order simply stays pending.
//
// So this pays at Stripe and delivers no webhook at all. The receipt has to
// settle the order and report the sale on its own, because a conversion that
// depends on a single delivery is one the ad account eventually stops seeing.
{
	const submissionId = `nohook-${RUN}`;
	const form = new URLSearchParams({
		email: 'nohook@example.com',
		fullName: 'No Hook',
		address1: '3 Test St',
		city: 'Delta',
		province: 'BC',
		postalCode: 'V3W 3N1',
		country: 'CA',
		method: 'express',
		cardReady: '1',
		submissionId,
		lines: JSON.stringify([{ variantId: variant, quantity: 1 }])
	});

	const placed = await fetch(`${BASE}/checkout`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
		body: form
	});
	const raw = await placed.text();
	const intentId = /(pi_test_mock_[A-Za-z0-9]+_\d+)_secret/.exec(raw)?.[1];

	const call = [...seen].reverse().find((c) => c.path === '/v1/payment_intents');
	const params = new URLSearchParams(call?.body ?? '');
	const orderNumber = params.get('metadata[order_number]');
	const amount = Number(params.get('amount'));

	check(
		'a second inline order minted an intent of its own',
		Boolean(intentId) && Boolean(orderNumber),
		`intent ${intentId} order ${orderNumber}`
	);

	// Unpaid so far, so the receipt must not claim otherwise — reconciliation
	// settles what Stripe says succeeded, never what the URL asks for.
	const beforeHtml = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`
	).then((r) => r.text());
	check(
		'an intent that has not succeeded does not settle the order',
		!/Payment received/i.test(beforeHtml) && /processing/i.test(beforeHtml),
		'reconciliation marked an unpaid order as sold'
	);

	// The card clears at Stripe. Nothing tells the application.
	const intent = intents.get(intentId);
	intent.status = 'succeeded';
	intent.amount_received = amount;

	const paidHtml = await fetch(
		`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`
	).then((r) => r.text());
	check('the receipt settles a sale no webhook announced', /Payment received/i.test(paidHtml));

	await settle();
	const reported = () => capiPurchases().filter((e) => e.event_id === `purchase-${orderNumber}`);
	check('and reports the conversion itself', reported().length === 1, `${reported().length} sent`);
	check(
		'for the amount actually captured',
		reported()[0]?.custom_data?.value === (amount / 100).toFixed(2),
		`${reported()[0]?.custom_data?.value} vs ${(amount / 100).toFixed(2)}`
	);

	// Nobody reloads a receipt once, and the page itself polls.
	await fetch(`${BASE}/checkout/success?order=${encodeURIComponent(orderNumber)}`).then((r) =>
		r.text()
	);
	await settle();
	check('reloading the receipt does not sell it twice', reported().length === 1, `${reported().length} sent`);

	// And the webhook may still turn up afterwards — subscriptions get fixed,
	// outages end, Stripe retries for days. It must find the order settled.
	const lateBody = JSON.stringify({
		id: `evt_late_${RUN}`,
		type: 'payment_intent.succeeded',
		data: {
			object: {
				id: intentId,
				amount_received: amount,
				currency: 'usd',
				metadata: { store_id: 'chillmypet', order_number: orderNumber }
			}
		}
	});
	const ts = Math.floor(Date.now() / 1000);
	const sig = createHmac('sha256', WEBHOOK_SECRET).update(`${ts}.${lateBody}`).digest('hex');
	const late = await fetch(`${BASE}/api/stripe/webhook`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'stripe-signature': `t=${ts},v1=${sig}` },
		body: lateBody
	});
	const outcome = await late.json();
	check(
		'a webhook landing after the receipt settles nothing new',
		outcome.handled === false && outcome.reason === 'duplicate',
		JSON.stringify(outcome)
	);
	await settle();
	check('and reports no second conversion', reported().length === 1, `${reported().length} sent`);
}

mock.close();
capi.close();
console.log(failures === 0 ? '\nPayment flow OK.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
