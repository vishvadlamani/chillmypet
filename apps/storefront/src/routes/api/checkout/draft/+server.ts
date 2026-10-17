import type { RequestHandler } from '@sveltejs/kit';

/**
 * Saves the email a shopper typed at checkout, with their cart, so one
 * reminder can follow if they leave without paying. The checkout posts here
 * once they stop typing.
 *
 * Public, so it says nothing: 204 whether the draft was saved, refused as
 * malformed, or failed. What it accepts is checked again in the recovery
 * module, and the cart is only ids and quantities — prices are read from the
 * database when the reminder is built.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = (await request.json()) as { email?: unknown; fullName?: unknown; lines?: unknown };
		const firstName = String(body.fullName ?? '').trim().split(/\s+/)[0] ?? '';
		await locals.commerce.recovery.saveDraft({
			email: String(body.email ?? ''),
			firstName,
			lines: Array.isArray(body.lines) ? body.lines : [],
			locale: locals.locale
		});
	} catch (error) {
		if (!(error instanceof SyntaxError)) console.error('Checkout draft not saved', error);
	}
	return new Response(null, { status: 204 });
};
