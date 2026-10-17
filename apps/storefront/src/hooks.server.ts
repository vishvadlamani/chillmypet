import { error, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createCommerce, createDirectory, type Store } from 'ecomwithai';
import { newEventId } from 'ecomwithai/marketing';
import { ADMIN_HEADERS, adminGate, isAdminPath } from '$lib/server/admin';
import { ensureCatalogue } from '$lib/server/catalogue';
import { metaBrowserIds } from '$lib/server/meta-browser-ids';
import { rememberedContact, type RememberedContact } from '$lib/server/identity';
import { attributionFrom, ensureVisitorId } from '$lib/server/purchase';
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
 * Each init carries the visitor's `external_id`, the same string every
 * Conversions API copy sends, so the two halves of an event name one person.
 * A returning shopper's remembered digests go in too, under the pixel's own
 * advanced-matching keys; the pixel sends a SHA-256 value as it is.
 *
 * Guards against database content reaching the page as markup, and against a
 * cookie doing the same: every value is checked against its exact shape again
 * here.
 */
function pixelSnippet(
	pixelIds: string[],
	pageViewEventId: string,
	externalId: string,
	contact: RememberedContact
): string {
	const ids = pixelIds.filter((id) => /^\d{1,20}$/.test(id));
	if (ids.length === 0) return '';

	const keys: Record<string, string | undefined> = {
		external_id: externalId,
		em: contact.email,
		ph: contact.phone,
		fn: contact.firstName,
		ln: contact.lastName,
		ct: contact.city,
		st: contact.state,
		zp: contact.zip,
		country: contact.country
	};
	const fields = Object.entries(keys)
		.filter(([, value]) => value && /^[a-f0-9]{64}$/.test(value))
		.map(([key, value]) => `${key}: '${value}'`);
	const matching = fields.length ? `, {${fields.join(', ')}}` : '';
	const inits = ids.map((id) => `fbq('init', '${id}'${matching});`).join('\n');
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
fbq('track', 'PageView', {}, {eventID: '${pageViewEventId}'});
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
 *
 * With `gatewayPath` (Google tag gateway, a Cloudflare route) the container
 * loads first-party from that path, where a blocker aimed at
 * googletagmanager.com cannot see it. The gateway is configured in Cloudflare,
 * not here, so if the route disappears the request errors and the script falls
 * back to Google's host. A page never depends on the gateway to get its tags.
 * The noscript iframe stays on Google: the gateway does not serve `ns.html`.
 */
function gtmSnippet(containerId: string, gatewayPath = ''): { head: string; body: string } {
	if (!/^GTM-[A-Z0-9]{4,12}$/.test(containerId)) return { head: '', body: '' };
	const gateway = /^\/[a-z0-9_-]{1,32}$/.test(gatewayPath) ? gatewayPath : '';

	return {
		head: `<script>(function(w,d,s,l,i,p){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
dl=l!='dataLayer'?'&l='+l:'',g='https://www.googletagmanager.com/gtm.js';
function load(u,fb){var j=d.createElement(s);j.async=true;j.src=u+'?id='+i+dl;
if(fb)j.onerror=function(){load(fb)};f.parentNode.insertBefore(j,f)}
load(p?p+'/gtm.js':g,p?g:'');
})(window,document,'script','dataLayer','${containerId}','${gateway}');</script>`,
		body: `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${containerId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
	};
}

/**
 * Clients that fetch pages but never run the pixel: search and ad crawlers
 * (Meta's own fetches every ad's landing page), link unfurlers, monitors and
 * scripts. Each one used to get a server PageView that no browser event could
 * ever match, and with only an IP and a user agent to go on.
 */
const NON_BROWSER =
	/bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|preview|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|httpclient|scrapy/i;

/** A person's browser asking for a page, as opposed to data, an API call, an asset or a bot. */
function isDocumentRequest(request: Request): boolean {
	const agent = request.headers.get('user-agent') ?? '';
	return (
		request.method === 'GET' &&
		(request.headers.get('accept') ?? '').includes('text/html') &&
		agent !== '' &&
		!NON_BROWSER.test(agent)
	);
}

function verificationTag(token: string): string {
	if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) return '';
	return `<meta name="facebook-domain-verification" content="${token}" />`;
}

export const handle: Handle = async ({ event, resolve }) => {
	// Before anything else, so an unauthenticated request costs no database read.
	const isAdmin = isAdminPath(event.url.pathname);
	if (isAdmin) {
		const denied = await adminGate(event.request, env.ADMIN_PASSWORD);
		if (denied) return denied;
	}

	const { db, stores } = getDirectory();

	// The Worker holds the database's credentials and the deploy pipeline never
	// has, so the Worker brings the database up to date itself: schema, then any
	// product the code defines and the store lacks. Once per isolate, in the
	// background, never on this request's path. See $lib/server/catalogue.
	// Guarded here as well as inside: housekeeping must never cost a visitor
	// the page, whatever the runtime does with it.
	try {
		ensureCatalogue(db, event.platform?.context);
	} catch (error) {
		console.error('catalogue sync could not start', error);
	}

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
	// Order confirmations. Without RESEND_API_KEY nothing is sent and nothing
	// fails — the same degrade-quietly rule as the CAPI token. The sending domain
	// has to be verified in Resend before the key is set, or every send is
	// rejected into console.error.
	event.locals.email = {
		apiKey: env.RESEND_API_KEY,
		from: env.EMAIL_FROM ?? settings.email_from ?? `${store.name} <orders@${store.domain}>`,
		replyTo: env.EMAIL_REPLY_TO ?? settings.email_reply_to ?? `contact@${store.domain}`,
		endpoint: env.EMAIL_API_ENDPOINT,
		origin: event.url.origin
	};
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
	// No pixel, no container and so no server PageView on the admin: the
	// operator packing orders is not a shopper, and the ad account would
	// otherwise count every order they open as a visit.
	const pixelIds = isAdmin ? [] : [primaryPixelId, ...extraPixels].filter(Boolean);
	const gtm = gtmSnippet(
		isAdmin ? '' : (env.GTM_CONTAINER_ID ?? settings.gtm_container_id ?? ''),
		env.GTM_GATEWAY_PATH ?? ''
	);

	const saved = event.cookies.get(LOCALE_COOKIE);
	const locale = isLocale(saved)
		? saved
		: negotiateLocale(event.request.headers.get('accept-language'), store.defaultLocale);

	event.locals.locale = locale;

	// This snippet's PageView is the only event the browser fires that never
	// reaches the `track()` wrapper, so it is the only one that cannot mint its
	// own id and post its own server copy. Both halves are issued here instead:
	// the id goes into the inline script, and the Conversions API copy goes out
	// from this same request, which already holds the cookies, address and user
	// agent that make it matchable.
	const pageViewEventId = newEventId();
	// Before resolve(), so the cookie is on this response and every read of it
	// later in this request, PageView's server copy included, sees the same id.
	const visitorId = ensureVisitorId(event.cookies);
	const isDocument = pixelIds.length > 0 && isDocumentRequest(event.request);
	// Same reason as the visitor id: SvelteKit puts cookies on the response
	// inside resolve(), and the document is where `_fbc` has to land to exist
	// before the pixel or any beacon runs. Every request, not just documents: a
	// beacon or form post gets its click id from the referrer this way.
	event.locals.metaBrowserIds = metaBrowserIds(event);

	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('%lang%', locale)
				.replace('%dir%', textDirection(locale))
				.replace('%meta_pixel%', pixelSnippet(pixelIds, pageViewEventId, visitorId, rememberedContact(event.cookies))
				)
				.replace('%gtm_head%', gtm.head)
				.replace('%gtm_body%', gtm.body)
				.replace(
					'%meta_domain_verification%',
					settings.meta_domain_verification
						? verificationTag(settings.meta_domain_verification)
						: ''
				)
	});

	// Documents only. `handle` also runs for data requests, form posts and the
	// API, and none of those rendered a snippet to deduplicate against — and a
	// HEAD gets no body, so no browser half ever runs for it either. Successful
	// pages only: the 404s are overwhelmingly scanners probing `/wp-login.php`
	// and `/.env`, which read the HTML and never execute it.
	if (
		isDocument &&
		response.status === 200 &&
		response.headers.get('content-type')?.includes('text/html')
	) {
		const send = event.locals.commerce.meta
			?.send({
				eventName: 'PageView',
				eventId: pageViewEventId,
				eventSourceUrl: event.url.href,
				user: {
					...rememberedContact(event.cookies),
					...attributionFrom(event.cookies, event.locals.metaBrowserIds, event.request.headers, event.getClientAddress())
				}
			})
			.then((result) => {
				if (!result.sent) console.error('Meta CAPI PageView not sent', result.reason);
			})
			.catch((error) => console.error('Meta CAPI PageView failed', error));

		// Called as a method — destructuring waitUntil loses `this` and throws.
		const context = event.platform?.context;
		if (send && context && typeof context.waitUntil === 'function') context.waitUntil(send);
	}

	if (isAdmin) {
		for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
	}

	return response;
};
