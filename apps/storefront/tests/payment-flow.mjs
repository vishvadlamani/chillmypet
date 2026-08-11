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
const mock = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		seen.push({ path: req.url, body, auth: req.headers.authorization ?? '' });
		if (req.url === '/v1/checkout/sessions') {
			const params = new URLSearchParams(body);
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(
				JSON.stringify({
					id: 'cs_test_mock_1',
					url: `${BASE}/__stripe-hosted-page`,
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

// --- place an order --------------------------------------------------------
const product = await fetch(`${BASE}/products/dog-life-jacket`).then((r) => r.text());
const variantId = Number(/"variants":\[\{"id":(\d+)/.exec(product)?.[1] ?? 0) || null;
const idFromEmbed = Number(/id:(\d+),sku:"CMP-LJ-[A-Z_]+-L"/.exec(product)?.[1] ?? 0) || null;
const variant = variantId ?? idFromEmbed;
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

mock.close();
capi.close();
console.log(failures === 0 ? '\nPayment flow OK.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
