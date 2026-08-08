import { redirect, type RequestHandler } from '@sveltejs/kit';
import { defaultLocale, isLocale } from '$lib/i18n';
import { LOCALE_COOKIE } from '../../hooks.server';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = await request.formData();

	const requested = form.get('locale');
	const locale = isLocale(typeof requested === 'string' ? requested : null)
		? String(requested)
		: defaultLocale;

	cookies.set(LOCALE_COOKIE, locale, {
		path: '/',
		httpOnly: false,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});

	// Only same-origin paths, so a crafted `to` can't turn this into an open redirect.
	const to = form.get('to');
	const target =
		typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') ? to : '/';

	redirect(303, target);
};
