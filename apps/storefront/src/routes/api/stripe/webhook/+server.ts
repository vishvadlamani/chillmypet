import type { RequestHandler } from './$types';

/**
 * Stripe webhook endpoint.
 *
 * Point Stripe at POST /api/stripe/webhook and set STRIPE_WEBHOOK_SECRET. The
 * raw body is passed through untouched — parsing and re-serializing it changes
 * the bytes and the signature will never match.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { payments } = locals.commerce;
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

	// Everything else answers 2xx. Duplicates, events for other tenants and event
	// types this store ignores are all expected, and a non-2xx makes Stripe retry
	// them for days.
	return Response.json(result, { status: 200 });
};
