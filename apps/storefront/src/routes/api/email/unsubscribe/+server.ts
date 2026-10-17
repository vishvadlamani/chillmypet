import { json, type RequestHandler } from '@sveltejs/kit';

/**
 * The unsubscribe page's button posts here. Kept off the page's GET on purpose:
 * mail scanners open every link in an email, and an unsubscribe that fired on a
 * GET would opt people out who never clicked anything.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	let token = '';
	try {
		token = String(((await request.json()) as { token?: unknown }).token ?? '');
	} catch {
		return json({ ok: false }, { status: 400 });
	}
	const ok = await locals.commerce.recovery.unsubscribe(token);
	return json({ ok }, { status: ok ? 200 : 404 });
};
