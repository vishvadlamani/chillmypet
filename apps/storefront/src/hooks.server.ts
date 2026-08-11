import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCommerce, createDirectory, type Store } from 'ecomwithai';
import { isLocale, negotiateLocale, textDirection } from '$lib/i18n';

export const LOCALE_COOKIE = 'locale';

// The libSQL client is cheap to hold and not free to rebuild, so the directory
// is memoized per isolate rather than per request.
let directory: ReturnType<typeof createDirectory> | undefined;
const settingsCache = new Map<string, Record<string, string>>();

function getDirectory() {
	if (!directory) {
		directory = createDirectory({
			url: env.TURSO_DATABASE_URL ?? 'file:local.db',
			authToken: env.TURSO_AUTH_TOKEN
		});
	}
	return directory;
}

/** Guards against database content reaching the page as markup. */
function pixelSnippet(pixelId: string): string {
	if (!/^\d{1,20}$/.test(pixelId)) return '';

	return `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" alt=""
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" /></noscript>`;
}

function verificationTag(token: string): string {
	if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) return '';
	return `<meta name="facebook-domain-verification" content="${token}" />`;
}

export const handle: Handle = async ({ event, resolve }) => {
	const { db, stores } = getDirectory();

	// Tenant comes from the Host header; localhost and preview URLs fall back to
	// a configured default so development needs no hosts-file entry.
	const host = event.request.headers.get('host') ?? event.url.host;
	const store: Store | null =
		(await stores.byDomain(host)) ?? (await stores.byId(env.DEFAULT_STORE_ID || 'chillmypet'));

	if (!store) {
		error(503, `No store configured for "${host}". Run the seed, or set DEFAULT_STORE_ID.`);
	}

	// Per-store config moved out of the stores table into settings, so the
	// framework core stays free of one storefront's marketing columns.
	let settings = settingsCache.get(store.id);
	if (!settings) {
		settings = await stores.settings(store.id);
		settingsCache.set(store.id, settings);
	}

	event.locals.store = store;
	event.locals.settings = settings;
	event.locals.commerce = createCommerce({
		db,
		store,
		orderNumberPrefix: 'CMP',
		stripe: env.STRIPE_SECRET_KEY
			? {
					secretKey: env.STRIPE_SECRET_KEY,
					webhookSecret: env.STRIPE_WEBHOOK_SECRET,
					// Mirrors META_CAPI_ENDPOINT: lets the end-to-end test drive a real
					// checkout against a local mock instead of charging a real card.
					// Unset in every deployed environment.
					baseUrl: env.STRIPE_API_BASE
				}
			: undefined,
		meta: {
			pixelId: settings.meta_pixel_id,
			accessToken: env.META_CAPI_ACCESS_TOKEN,
			apiVersion: env.META_CAPI_API_VERSION,
			endpoint: env.META_CAPI_ENDPOINT,
			testEventCode: env.META_CAPI_TEST_EVENT_CODE,
			attributionShare: env.META_ATTRIBUTION_SHARE
		}
	});

	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = isLocale(saved)
		? saved
		: negotiateLocale(event.request.headers.get('accept-language'), store.defaultLocale);

	event.locals.locale = locale;

	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', locale)
				.replace('%dir%', textDirection(locale))
				.replace('%meta_pixel%', settings.meta_pixel_id ? pixelSnippet(settings.meta_pixel_id) : '')
				.replace(
					'%meta_domain_verification%',
					settings.meta_domain_verification
						? verificationTag(settings.meta_domain_verification)
						: ''
				)
	});
};
