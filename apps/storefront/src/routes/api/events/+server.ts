import { parseBrowserEvent } from 'ecomwithai/marketing';
import { dispatch } from '$lib/server/dispatch';
import { attributionFrom } from '$lib/server/purchase';
import type { RequestHandler } from './$types';

/**
 * The server half of the funnel events the browser fires.
 *
 * Meta counts an event once per `event_id` + `event_name`, so the browser sends
 * both halves the same id and this reports the copy that survives an ad
 * blocker, ITP, or a tab closed before `fbevents.js` loaded. Without it the
 * dataset only ever sees the browser's version of everything except Purchase,
 * which is what Events Manager reports as the server sending fewer events.
 *
 * **Not `/api/track`.** Generic privacy blocklists match request paths
 * containing "track", including first-party ones. The entire point of this
 * route is to be the copy that arrives when the pixel was blocked, so naming it
 * after the thing being blocked defeats it.
 *
 * Anything can POST here, so nothing in the body is believed:
 * `parseBrowserEvent` clamps it to known event names and known fields, refuses
 * an event with no id — an unlabelled server event cannot dedupe and
 * double-counts, so sending it is worse than not — and scopes
 * `event_source_url` to this origin. Identity is never read from the body:
 * cookies, address and user agent are what the request itself carries, and a
 * page must not be able to claim to be someone else.
 *
 * Purchase is refused outright. A sale is reported from the order, where money
 * moving is known; a public endpoint must not be able to inject the one event
 * the ad account bids on.
 *
 * The answer is always 204. A tracking beacon must never surface an error on
 * the page that fired it, and one that reports what it rejected is an oracle
 * for what it accepts.
 */

/** Room for a full cart's `contents`, and no room for anything else. */
const MAX_BODY_BYTES = 8 * 1024;

const accepted = () => new Response(null, { status: 204 });

export const POST: RequestHandler = async ({
	request,
	locals,
	url,
	cookies,
	platform,
	getClientAddress
}) => {
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return accepted();

	const meta = locals.commerce.meta;
	// No token configured: nothing to send, and no reason to parse the body.
	if (!meta?.isConfigured()) return accepted();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return accepted();
	}

	const event = parseBrowserEvent(body, url.origin);
	if (!event) return accepted();

	// Attribution belongs to the page the customer was on, not to this beacon:
	// `?fbclid=` is on the landing URL, and `_fbc` is only a cookie once Meta's
	// script has run. The referer is the same page when the body left it off.
	const sourceUrl =
		sameOrigin(event.eventSourceUrl, url) ?? sameOrigin(request.headers.get('referer'), url) ?? url;

	dispatch(
		platform,
		meta
			.send({
				eventName: event.eventName,
				eventId: event.eventId,
				eventSourceUrl: sourceUrl.href,
				user: attributionFrom(cookies, sourceUrl, request.headers, getClientAddress()),
				customData: event.customData
			})
			.then((result) => {
				if (!result.sent) {
					console.error('Meta event not sent', event.eventName, result.reason, result.detail);
				}
			})
	);

	return accepted();
};

/** A URL only counts if it is this site's; otherwise we'd report onto someone else's domain. */
function sameOrigin(candidate: string | null | undefined, self: URL): URL | null {
	if (!candidate) return null;
	try {
		const parsed = new URL(candidate);
		return parsed.origin === self.origin ? parsed : null;
	} catch {
		return null;
	}
}
