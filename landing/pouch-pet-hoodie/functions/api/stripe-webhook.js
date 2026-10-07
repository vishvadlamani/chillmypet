/*
 * POST /api/stripe-webhook: the server half of a hoodie sale.
 *
 * thank-you.html fires the browser Purchase, and iOS and ad blockers eat a
 * share of those. This endpoint sends the same sale to Meta's Conversions API
 * when Stripe confirms the payment, under the same event_id (the Checkout
 * Session id the thank-you page already uses), so Meta counts it once.
 *
 * The Stripe account also has the storefront's webhook. Both endpoints see
 * every session: the storefront ignores this one (no order behind it), and
 * this one ignores everything without the hoodie link's metadata.
 *
 * Pages secrets:
 *   STRIPE_WEBHOOK_SECRET   whsec_… of THIS endpoint (not the storefront's)
 *   META_CAPI_ACCESS_TOKEN  a token generated for PIXEL_ID's dataset
 * Optional var:
 *   META_TEST_EVENT_CODE    routes events to Events Manager → Test events
 */
import { verifyStripeSignature } from '../../../../packages/ecomwithai/src/payments/signature.ts';
import { createMetaService, toAmount } from '../../../../packages/ecomwithai/src/marketing/index.ts';

/**
 * The dataset of the ad account that runs the ads (1550461850095009), the same
 * META_PIXEL_ID as apps/storefront/wrangler.toml. A CAPI token is scoped to one
 * dataset, so the token must be generated for this id or Meta rejects it.
 */
export const PIXEL_ID = '1341978141149107';

const SLUG = 'pouch-pet-hoodie';
const PAGE = 'https://chillmypet-hoodie.pages.dev/thank-you.html';

export async function onRequestPost({ request, env }) {
	if (!env.STRIPE_WEBHOOK_SECRET) {
		// 503 rather than 200 so Stripe keeps retrying: a sale made before the
		// secret is set is reported once it is, instead of being acknowledged
		// and lost.
		return json({ handled: false, reason: 'not_configured', missing: 'STRIPE_WEBHOOK_SECRET' }, 503);
	}

	// The exact bytes Stripe signed. Parsing and re-serializing would change them.
	const raw = await request.text();
	const check = await verifyStripeSignature({
		payload: raw,
		header: request.headers.get('stripe-signature'),
		secret: env.STRIPE_WEBHOOK_SECRET
	});
	if (!check.valid) return json({ handled: false, reason: 'invalid_signature', detail: check.reason }, 400);

	const event = JSON.parse(raw);
	const purchase = purchaseFrom(event);
	if (!purchase.report) return json({ handled: false, reason: purchase.reason });

	const meta = createMetaService({
		pixelId: PIXEL_ID,
		accessToken: env.META_CAPI_ACCESS_TOKEN,
		testEventCode: env.META_TEST_EVENT_CODE
	});
	const result = await meta.send(purchase.event);

	// This endpoint does nothing but report, so a failed report is a failed
	// delivery: a non-2xx makes Stripe retry for three days, and shows the
	// failure in the Dashboard instead of only in a log nobody reads. Meta
	// dedupes the retries on event_id.
	if (!result.sent) {
		console.error('Hoodie Purchase not reported', purchase.event.eventId, result);
		return json({ handled: false, reason: result.reason, detail: result.detail }, result.reason === 'not_configured' ? 503 : 502);
	}
	return json({ handled: true, eventId: purchase.event.eventId });
}

/**
 * Decides whether a Stripe event is a paid hoodie order, and builds the CAPI
 * event for it. Pure, so the tests can call it without a request.
 */
export function purchaseFrom(event) {
	const type = event && event.type;
	const session = event && event.data && event.data.object;

	// `completed` with payment_status "paid" is a card sale. A delayed method
	// (a bank debit) completes "unpaid" and settles later with
	// `async_payment_succeeded`. That later event is the sale, so the early
	// one is skipped rather than reported for money that may never arrive.
	if (type === 'checkout.session.completed') {
		if (session.payment_status !== 'paid') return { report: false, reason: 'awaiting_payment' };
	} else if (type !== 'checkout.session.async_payment_succeeded') {
		return { report: false, reason: 'ignored', detail: type };
	}

	// The Payment Link copies its metadata onto every session it creates, so
	// this survives the link being replaced, as it was for the $49 price.
	if (!session.metadata || session.metadata.slug !== SLUG) {
		return { report: false, reason: 'not_hoodie' };
	}

	const customer = session.customer_details || {};
	const shipping =
		(session.collected_information && session.collected_information.shipping_details) ||
		session.shipping_details ||
		{};
	const address = customer.address || shipping.address || {};
	const [firstName, lastName] = splitName(customer.name || shipping.name);

	return {
		report: true,
		event: {
			eventName: 'Purchase',
			// The id thank-you.html passes as eventID. Same id, one sale.
			eventId: session.id,
			eventTime: event.created,
			eventSourceUrl: PAGE,
			user: {
				email: customer.email || undefined,
				phone: customer.phone || undefined,
				firstName,
				lastName,
				city: address.city || undefined,
				state: address.state || undefined,
				zip: address.postal_code || undefined,
				country: address.country || undefined
			},
			customData: {
				// What Stripe charged in the link's currency, not the converted
				// amount a buyer may have chosen to pay in.
				value: toAmount(session.amount_total),
				currency: String(session.currency).toUpperCase(),
				content_type: 'product',
				content_ids: [SLUG],
				// The link fixes quantity at one.
				num_items: 1
			}
		}
	};
}

/** "Mary Ann Smith" → ["Mary Ann", "Smith"]; one word is a first name only. */
function splitName(full) {
	const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return [undefined, undefined];
	if (parts.length === 1) return [parts[0], undefined];
	return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

function json(body, status = 200) {
	return Response.json(body, { status });
}
