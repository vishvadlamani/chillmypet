import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCommerce, createDirectory, type Store } from 'ecomwithai';
import { newEventId } from 'ecomwithai/marketing';
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

/**
 * Meta's loader, initialising every pixel measuring this store.
 *
 * More than one is normal — a second ad account, an agency, an affiliate. They
 * share one loader and one `PageView`: `fbq('track', …)` reports to every
 * initialised pixel, so each gets exactly one, and the same holds for the
 * events the app fires later.
 *
 * The PageView carries an `eventID` so its Conversions API twin is recognised
 * as the same event rather than counted as a second page view.
 *
 * Guards against database content reaching the page as markup.
 */
function pixelSnippet(pixelIds: string[], pageViewEventId: string): string {
	const ids = pixelIds.filter((id) => /^\d{1,20}$/.test(id));
	if (ids.length === 0) return '';

	// Same rule the bridge applies to an id it is handed. An id that cannot be
	// written into the page safely is left out; a PageView with no id still
	// counts, it just cannot dedupe.
	const eventId = /^[A-Za-z0-9._:-]{1,120}$/.test(pageViewEventId) ? pageViewEventId : '';

	const inits = ids.map((id) => `fbq('init', '${id}');`).join('\n');
	const noscript = ids
		.map(
			(id) => `<noscript><img height="1" width="1" style="display:none" alt=""
src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1" /></noscript>`
		)
		.join('\n');

	return `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
${inits}
fbq('track', 'PageView'${eventId ? `, {}, { eventID: '${eventId}' }` : ''});
</script>
${noscript}`;
}

/**
 * Google Tag Manager, on every page.
 *
 * A container is a second place tags can be published from, by whoever holds
 * access to it, and anything it loads runs with the same reach as this file's
 * own code. The id is validated here; note that a Meta pixel published inside
 * the container would double-count against the ones initialised above.
 */
function gtmSnippet(containerId: string): { head: string; body: string } {
	if (!/^GTM-[A-Z0-9]{4,12}$/.test(containerId)) return { head: '', body: '' };

	return {
		head: `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${containerId}');</script>`,
		body: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
	};
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

	// The pixel that owns this store's dataset. Both the browser events and the
	// Conversions API copy report to this one, and a CAPI token is scoped to a
	// single dataset — so this must be the pixel the ad account optimises
	// against, or its conversions are browser-only and die on iOS and blockers.
	// An env override so correcting it is a config change, not a database write.
	const primaryPixelId = env.META_PIXEL_ID ?? settings.meta_pixel_id ?? '';

	// This snippet's PageView is the only event the browser fires that never
	// reaches the `track()` wrapper, so it cannot mint its own id. One is minted
	// here, written into the inline script, and handed to the layout through page
	// data, which posts the Conversions API half to `/api/events` once the page
	// hydrates.
	//
	// The server copy is deliberately NOT sent from here. `handle` runs for every
	// HTML request, and most of those are not people: crawlers, uptime monitors,
	// security scanners and link previews all fetch a document and never run a
	// line of JavaScript. Sending from here gives each of them a server PageView
	// with no browser half — unmatched events that push reported coverage *down*
	// while filling the dataset with traffic no campaign should optimise against.
	// Posting from the browser costs one request and keeps the two halves 1:1.
	event.locals.pageViewEventId = newEventId();
	event.locals.store = store;
	// Publishable, not secret — it identifies the account to Stripe.js and is
	// meant to ship to the browser. Without it there is nothing to mount the
	// embedded form with, so checkout falls back to the hosted page.
	event.locals.stripePublishableKey = env.STRIPE_PUBLISHABLE_KEY ?? '';
	// Also needed in the browser: in deferred mode the Payment Element decides
	// which methods to draw before any intent exists, so restricting the intent
	// alone leaves the form still offering everything on the account.
	event.locals.stripePaymentMethodConfiguration = env.STRIPE_PAYMENT_METHOD_CONFIGURATION ?? '';
	event.locals.settings = settings;
	event.locals.commerce = createCommerce({
		db,
		store,
		orderNumberPrefix: 'CMP',
		// Buy-more-save-more. The storefront renders these; the server decides
		// them, from the quantity it counts after merging duplicate lines.
		quantityBreaks: [
			{ minQuantity: 2, percentOff: 7 },
			{ minQuantity: 3, percentOff: 9 }
		],
		stripe: env.STRIPE_SECRET_KEY
			? {
					secretKey: env.STRIPE_SECRET_KEY,
					webhookSecret: env.STRIPE_WEBHOOK_SECRET,
					// What the buyer sees on their card statement. Set this when the
					// Stripe account is not named ChillMyPet, or they will not
					// recognise the charge and will dispute it. Use the full form
					// unless the account has a descriptor prefix configured.
					statementDescriptor: env.STRIPE_STATEMENT_DESCRIPTOR,
					statementDescriptorSuffix: env.STRIPE_STATEMENT_DESCRIPTOR_SUFFIX,
					// Scopes the offered methods to this store. The Stripe account is
					// shared with another business, so the account default is not ours
					// to edit.
					paymentMethodConfiguration: env.STRIPE_PAYMENT_METHOD_CONFIGURATION,
					// Mirrors META_CAPI_ENDPOINT: lets the end-to-end test drive a real
					// checkout against a local mock instead of charging a real card.
					// Unset in every deployed environment.
					baseUrl: env.STRIPE_API_BASE
				}
			: undefined,
		meta: {
			pixelId: primaryPixelId,
			accessToken: env.META_CAPI_ACCESS_TOKEN,
			apiVersion: env.META_CAPI_API_VERSION,
			endpoint: env.META_CAPI_ENDPOINT,
			testEventCode: env.META_CAPI_TEST_EVENT_CODE,
			attributionShare: env.META_ATTRIBUTION_SHARE
		}
	});

	// The store's own pixel, plus any other account measuring the same pages.
	// Comma-separated, so adding one is a config change rather than a code one.
	const extraPixels = (env.META_EXTRA_PIXEL_IDS ?? settings.meta_extra_pixel_ids ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	const pixelIds = [primaryPixelId, ...extraPixels].filter(Boolean);
	const gtm = gtmSnippet(env.GTM_CONTAINER_ID ?? settings.gtm_container_id ?? '');

	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = isLocale(saved)
		? saved
		: negotiateLocale(event.request.headers.get('accept-language'), store.defaultLocale);

	event.locals.locale = locale;

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', locale)
				.replace('%dir%', textDirection(locale))
				.replace('%meta_pixel%', pixelSnippet(pixelIds, event.locals.pageViewEventId))
				.replace('%gtm_head%', gtm.head)
				.replace('%gtm_body%', gtm.body)
				.replace(
					'%meta_domain_verification%',
					settings.meta_domain_verification
						? verificationTag(settings.meta_domain_verification)
						: ''
				)
	});

	return response;
};
