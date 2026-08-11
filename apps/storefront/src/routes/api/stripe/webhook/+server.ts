import { sendPurchase } from '$lib/server/purchase';
import type { RequestHandler } from './$types';

/**
 * Stripe webhook endpoint.
 *
 * Point Stripe at POST /api/stripe/webhook and set STRIPE_WEBHOOK_SECRET. The
 * raw body is passed through untouched — parsing and re-serializing it changes
 * the bytes and the signature will never match.
 */
export const POST: RequestHandler = async ({ request, locals, url, platform }) => {
	const { commerce } = locals;
	const { payments } = commerce;
	if (!payments) {
		return new Response('Payments are not configured for this store', { status: 503 });
	}

	const raw = await request.text();
	const result = await payments.handleWebhook(raw, request.headers.get('stripe-signature'));

	if (!result.handled && result.reason === 'invalid_signature') {
		// The one case worth rejecting loudly: it is either misconfiguration or
		// someone probing the endpoint.
		return new Response('Invalid signature', { status: 400 });
	}

	// A sale is reported once money actually moved. `order_paid` is returned only
	// by the branch that applied the state change, and that branch is guarded by
	// the event-id dedup table — so a redelivered event, which Stripe does
	// aggressively, cannot report the same conversion twice.
	if (result.handled && result.action === 'order_paid' && result.orderNumber) {
		const tracking = trackPurchase(commerce, result.orderNumber, raw, url);
		const context = platform?.context;
		if (context && typeof context.waitUntil === 'function') {
			context.waitUntil(tracking);
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
		// handled, so these bytes are Stripe's. Only the click identifiers are
		// taken from here — everything else comes from our own order row.
		const metadata = readMetadata(rawBody);

		await sendPurchase(commerce, order, {
			eventSourceUrl: `${url.origin}/checkout/success?order=${encodeURIComponent(orderNumber)}`,
			attribution: {
				fbp: metadata.fbp,
				fbc: metadata.fbc
			}
		});
	} catch (error) {
		console.error('Purchase tracking failed after payment', orderNumber, error);
	}
}

function readMetadata(rawBody: string): { fbp?: string; fbc?: string } {
	try {
		const event = JSON.parse(rawBody) as Record<string, unknown>;
		const object = ((event.data as Record<string, unknown>)?.object ?? {}) as Record<
			string,
			unknown
		>;
		const metadata = (object.metadata ?? {}) as Record<string, unknown>;
		return {
			fbp: typeof metadata.fbp === 'string' ? metadata.fbp : undefined,
			fbc: typeof metadata.fbc === 'string' ? metadata.fbc : undefined
		};
	} catch {
		return {};
	}
}
