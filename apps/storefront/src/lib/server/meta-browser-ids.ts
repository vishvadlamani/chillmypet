import type { RequestEvent } from '@sveltejs/kit';
import { ParamBuilder } from 'capi-param-builder-nodejs';

/** Meta's browser cookies, as the Conversions API should receive them. */
export type MetaBrowserIds = {
	fbp?: string;
	fbc?: string;
};

// RFC 6265 cookie-octet. `fbclid` arrives from the query string, so it is
// whatever the visitor's URL said; a value outside this set cannot be written
// to a Set-Cookie header and would throw rather than be skipped.
const COOKIE_SAFE = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

/**
 * Builds `fbc` and `fbp` with Meta's Parameter Builder, and writes them back as
 * first-party cookies from the server.
 *
 * Before this, `_fbc` only existed if `fbevents.js` ran on a page that still had
 * `fbclid` in its URL. An ad blocker, Safari's cap on script-set cookies, or a
 * beacon fired before the script loaded each meant every later event went to
 * Meta with no click id. Setting the cookie on the document response itself
 * means it exists before any script runs, and survives a blocked pixel.
 *
 * The builder also tags each value with which library produced it, which is
 * how Meta tells a click id we passed on intact from one that was rewritten
 * along the way. Values must reach Meta exactly as returned here.
 */
export function metaBrowserIds(event: RequestEvent, sourceUrl?: URL): MetaBrowserIds {
	const { url, cookies, request } = event;

	try {
		const builder = new ParamBuilder();
		builder.processRequest(
			url.host,
			Object.fromEntries((sourceUrl ?? url).searchParams),
			Object.fromEntries(cookies.getAll().map((c) => [c.name, c.value])),
			// A beacon's declared page URL is more precise than Referer, which
			// privacy policies can remove or reduce to an origin. Do not let
			// a different referrer's click override that page.
			sourceUrl ? null : request.headers.get('referer')
		);

		for (const cookie of builder.getCookiesToSet()) {
			if (!COOKIE_SAFE.test(cookie.value)) continue;
			cookies.set(cookie.name, cookie.value, {
				path: '/',
				maxAge: cookie.maxAge,
				// Shared with every subdomain, as the pixel does, so www and the
				// apex read one cookie. A browser refuses a Domain attribute of
				// `localhost` or an IP, so those stay host-only.
				...(isRegistrableDomain(cookie.domain) ? { domain: cookie.domain } : {}),
				// The pixel reads and refreshes these from the page.
				httpOnly: false,
				sameSite: 'lax',
				secure: url.protocol === 'https:',
				// Written verbatim. The default percent-encodes, which is a
				// modified click id as far as the pixel is concerned.
				encode: (value) => value
			});
		}

		return {
			fbp: builder.getFbp() ?? undefined,
			fbc: builder.getFbc() ?? undefined
		};
	} catch (error) {
		// Tracking must never fail a page. Fall back to whatever the pixel set.
		console.error('Meta param builder failed', error);
		return { fbp: cookies.get('_fbp'), fbc: cookies.get('_fbc') };
	}
}

function isRegistrableDomain(domain: string | null | undefined): domain is string {
	return Boolean(domain && domain.includes('.') && !/^[\d.]+$/.test(domain) && !domain.includes(':'));
}
