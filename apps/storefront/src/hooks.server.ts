import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCommerce, createDirectory, type Store } from 'ecomwithai';
import { isSha256Hex, newEventId } from 'ecomwithai/marketing';
import { advancedMatching, ensureIdentity, identityFrom } from '$lib/server/identity';
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
 * Meta's loader, for the one pixel measuring this store.
 *
 * One is the whole design. A second pixel would get browser events and no
 * Conversions API copy — a token belongs to a single dataset — so it would
 * report whatever iOS and ad blockers let through and nothing else. This store
 * ran that way for a month, with the ad account's own pixel as the extra one,
 * and the campaign showed no conversions the entire time.
 *
 * `matching` is advanced matching, and it goes on `init` rather than on the
 * event, so it applies to this PageView and to everything the app fires
 * afterwards. The values are the hashes the Conversions API copy sends, so the
 * two halves of an event resolve to one person.
 *
 * Guards against database content reaching the page as markup.
 */
function pixelSnippet(
	pixelId: string,
	pageViewEventId: string,
	matching: Record<string, string>
): string {
	if (!/^\d{1,20}$/.test(pixelId)) return '';

	// Hex digests only. Nothing else can reach an inline script from here, and
	// this is what makes that true rather than a thing the caller promises.
	const safe = Object.fromEntries(
		Object.entries(matching).filter(([, hash]) => isSha256Hex(hash))
	);
	const advanced = Object.keys(safe).length > 0 ? `, ${JSON.stringify(safe)}` : '';

	const noscript = `<noscript><img height="1" width="1" style="display:none" alt=""
src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" /></noscript>`;

	return `<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}'${advanced});
fbq('track', 'PageView', {}, {eventID: '${pageViewEventId}'});
</script>
${noscript}`;
}

/**
 * Google Analytics, on every page, when one is configured.
 *
 * This replaced a Tag Manager container. A container is a second place tags can
 * be published from, by whoever holds access to it, and anything it loads runs
 * with the same reach as this file's own code — while the one here served zero
 * tags, so every page paid ~330KB to run nothing. gtag.js talks to one
 * property and nothing can be published into it without a commit.
 *
 * Renders nothing when unset, which is what it is until `GA4_MEASUREMENT_ID`
 * is given a value: `ga4Event` goes quiet rather than queueing for a library
 * that will never load. The id is validated, because it reaches the page as
 * markup.
 */
function ga4Snippet(measurementId: string): string {
	if (!/^G-[A-Z0-9]{4,12}$/.test(measurementId)) return '';

	return `<script async src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>
<script>window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');</script>`;
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

	// This store's one pixel. Browser events and the Conversions API copy both
	// report to it, and a CAPI token is scoped to a single dataset — so it must
	// be the pixel the ad account optimises against, or its conversions are
	// browser-only and die on iOS and blockers.
	// An env override so correcting it is a config change, not a database write.
	const pixelId = env.META_PIXEL_ID ?? settings.meta_pixel_id ?? '';

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
			pixelId,
			accessToken: env.META_CAPI_ACCESS_TOKEN,
			apiVersion: env.META_CAPI_API_VERSION,
			endpoint: env.META_CAPI_ENDPOINT,
			testEventCode: env.META_CAPI_TEST_EVENT_CODE,
			attributionShare: env.META_ATTRIBUTION_SHARE
		}
	});

	const ga4 = ga4Snippet(env.GA4_MEASUREMENT_ID ?? settings.ga4_measurement_id ?? '');

	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = isLocale(saved)
		? saved
		: negotiateLocale(event.request.headers.get('accept-language'), store.defaultLocale);

	event.locals.locale = locale;

	// Before the response, so `cookies.get` reads them back for the rest of this
	// request — the snippet below, and the beacon a client-side navigation posts
	// later. A visitor who arrives, bounces, and comes back in a week is the
	// same `external_id` both times, which is the whole of what it buys.
	ensureIdentity(event);
	const identity = identityFrom(
		event.cookies,
		event.url,
		event.request.headers,
		event.getClientAddress()
	);

	// This snippet's PageView is the only event the browser fires that never
	// reaches the `track()` wrapper, so it is the only one that cannot mint its
	// own id and post its own server copy. Both halves are issued here instead:
	// the id goes into the inline script, and the Conversions API copy goes out
	// from this same request, which already holds the cookies, address and user
	// agent that make it matchable.
	const pageViewEventId = newEventId();
	const matching = await advancedMatching(identity);

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', locale)
				.replace('%dir%', textDirection(locale))
				.replace('%meta_pixel%', pixelSnippet(pixelId, pageViewEventId, matching))
				.replace('%ga4%', ga4)
				.replace(
					'%meta_domain_verification%',
					settings.meta_domain_verification
						? verificationTag(settings.meta_domain_verification)
						: ''
				)
	});

	// Documents only. `handle` also runs for data requests, form posts and the
	// API, and none of those rendered a snippet to deduplicate against.
	if (pixelId && response.headers.get('content-type')?.includes('text/html')) {
		const send = event.locals.commerce.meta
			?.send({
				eventName: 'PageView',
				eventId: pageViewEventId,
				eventSourceUrl: event.url.href,
				user: identity
			})
			.then((result) => {
				if (!result.sent) console.error('Meta CAPI PageView not sent', result.reason);
			})
			.catch((error) => console.error('Meta CAPI PageView failed', error));

		// Called as a method — destructuring waitUntil loses `this` and throws.
		const context = event.platform?.context;
		if (send && context && typeof context.waitUntil === 'function') context.waitUntil(send);
	}

	return response;
};
