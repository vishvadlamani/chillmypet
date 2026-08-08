import type { Handle } from '@sveltejs/kit';
import { isLocale, negotiateLocale, textDirection } from '$lib/i18n';

export const LOCALE_COOKIE = 'locale';

export const handle: Handle = async ({ event, resolve }) => {
	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = isLocale(saved)
		? saved
		: negotiateLocale(event.request.headers.get('accept-language'));

	event.locals.locale = locale;

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('%lang%', locale).replace('%dir%', textDirection(locale))
	});
};
