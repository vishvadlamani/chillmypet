import { sendAlert } from '$lib/server/alerts';
import { attributionFromMetadata, sendPurchase } from '$lib/server/purchase';
import type { RequestHandler } from './$types';

/**
 * Stripe webhook endpoint.
 *
 * Point Stripe at POST /api/stripe/webhook and set STRIPE_WEBHOOK_SECRET. The
 * raw body is passed through untouched — parsing and re-serializing it changes
 * the bytes and the signature will never match.
 *
 * What this endpoint answers with matters as much as what it does:
 *
 *   invalid signature   400, so a misconfigured endpoint is loud
 *   handled             200
 *   duplicate           200 — Stripe redelivers aggressively and that is fine
 *   unrecognised type   200 — a 500 here buys days of pointless retries
 *   threw               500, so Stripe retries something that really did fail
 *
 * Everything slow happens after the response is decided and rides on
 * `waitUntil`: a conversion report or an alert must never be able to turn a
 * third party's bad afternoon into a Stripe retry.
 */
export const POST: RequestHandler = async ({ request, locals, url, platform }) => {
	const { commerce } = locals;
	const { payments } = commerce;
	if (!payments) {
		return new Response('Payments are not configured for this store', { status: 503 });
	}

	const raw = await request.text();

	// Called as a method — destructuring waitUntil loses `this` and throws on
	// the Workers runtime.
	const context = platform?.context;
	const after = (work: Promise<unknown>) => {
		if (context && typeof context.waitUntil === 'function') context.waitUntil(work);
	};

	let result;
	try {
		result = await payments.handleWebhook(raw, request.headers.get('stripe-signature'));
	} catch (error) {
		// A retrieval that failed, a database that was unreachable. Stripe should
		// try again, which is the one thing a 500 is good for here.
		console.error('Stripe webhook handler threw', error);
		return new Response('Handler failed', { status: 500 });
	}

	if (!result.handled && result.reason === 'invalid_signature') {
		// The one case worth rejecting loudly: it is either misconfiguration or
		// someone probing the endpoint.
		return new Response('Invalid signature', { status: 400 });
	}

	if (result.handled) {
		// A sale is reported once money actually moved. `order_paid` is returned
		// only by the branch that won the transition on the order row — a
		// redelivery, or the second of the two events a hosted session produces,
		// comes back `already_paid` and reports nothing.
		if (result.action === 'order_paid' && result.orderNumber) {
			after(trackPurchase(commerce, result.orderNumber, raw, url));
		}

		// Both of these have a clock on them, so they go to a person rather than
		// to a log nobody reads. See $lib/server/alerts.
		if (result.action === 'dispute_opened') {
			after(
				sendAlert({
					subject: '⚠️ Chargeback opened',
					orderNumber: result.orderNumber,
					detail: `${result.detail ?? ''} — evidence must be submitted before the deadline or the dispute is lost by default.`
				})
			);
		}

		if (result.action === 'fraud_warning') {
			after(
				sendAlert({
					subject: '⚠️ Early fraud warning',
					orderNumber: result.orderNumber,
					detail: `${result.detail ?? ''} — refunding before this becomes a chargeback avoids the dispute fee.`
				})
			);
		}
	}

	// Everything else answers 2xx. Duplicates, events for other tenants and event
	// types this store ignores are all expected, and a non-2xx makes Stripe retry
	// them for days.
	return Response.json(result, { status: 200 });
};

/**
 * Reports the conversion to Meta. Never rejects — Stripe must still get its 2xx
 * if this fails, or it will redeliver an event that was already applied.
 */
async function trackPurchase(
	commerce: App.Locals['commerce'],
	orderNumber: string,
	rawBody: string,
	url: URL
): Promise<void> {
	try {
		const order = await commerce.orders.byNumber(orderNumber);
		if (!order) return;

		// Safe to read now: handleWebhook verified the signature before returning
		// handled, so these bytes are Stripe's. Only the browser context is taken
		// from here — everything else comes from our own order row.
		//
		// It has to come from here rather than from this request. This request is
		// Stripe's: its IP is a Stripe datacenter and its user agent is Stripe's
		// client, and reporting those as the buyer's would match every sale
		// against the same fictional person.
		const metadata = readMetadata(rawBody);

		await sendPurchase(commerce, order, {
			eventSourceUrl: `${url.origin}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
			attribution: attributionFromMetadata(metadata)
		});
	} catch (error) {
		console.error('Purchase tracking failed after payment', orderNumber, error);
	}
}

function readMetadata(rawBody: string): Record<string, unknown> {
	try {
		const event = JSON.parse(rawBody) as Record<string, unknown>;
		const object = ((event.data as Record<string, unknown>)?.object ?? {}) as Record<
			string,
			unknown
		>;
		return (object.metadata ?? {}) as Record<string, unknown>;
	} catch {
		return {};
	}
}
