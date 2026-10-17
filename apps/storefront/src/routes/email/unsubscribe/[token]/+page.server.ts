import type { PageServerLoad } from './$types';

/** Shows the button; the unsubscribe itself is a POST from it (see /api/email/unsubscribe). */
export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const draft = await locals.commerce.recovery.byToken(params.token);
	return { token: params.token, valid: Boolean(draft) };
};
