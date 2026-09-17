import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { buildFbc, buildUserData, newFbp, type CapiUserInput } from 'ecomwithai/marketing';

/**
 * Who this request is, as far as Meta's matching is concerned.
 *
 * Match quality is scored per event, and PageView is the event with the least
 * to say: someone who has not typed into a form yet has no email and no phone
 * to send, so it is scored on whatever identifiers the request itself carries.
 * Meta's own two cookies are only set if their script ran, which for a visitor
 * running a blocker it did not — so this mints and persists both first-party,
 * adds an `external_id` of our own that every visitor carries, and remembers a
 * hashed email and phone once a checkout has given us one.
 *
 * One source for both halves of an event. The browser snippet gets the same
 * hashed values through `fbq('init', …)` advanced matching that the Conversions
 * API sends in `user_data`, so the pixel and the server describe one person
 * rather than two — which is the whole point of sending either.
 */

/** Meta's own names and format, because their script has to keep using them. */
export const FBC_COOKIE = '_fbc';
export const FBP_COOKIE = '_fbp';
/** Ours. Opaque, and never leaves the server unhashed. */
export const VISITOR_COOKIE = 'cmp_vid';
export const MATCH_COOKIE = 'cmp_match';

/** What Meta gives an `fbc`/`fbp`, and what their script sets its own to. */
const CLICK_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
/** Shorter than the visitor id: a remembered identity ages worse than an id. */
const MATCH_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * `httpOnly` on ours, deliberately. Nothing in the browser reads them — the
 * snippet is server-rendered and already holds the hashes — so the only thing
 * page-readable would buy is a way for any third-party script, or an injected
 * one, to lift a remembered customer off the page.
 */
const OURS = { path: '/', httpOnly: true, sameSite: 'lax' } as const;
/** Meta's, which fbevents.js must be able to read and keep. */
const METAS = { path: '/', httpOnly: false, sameSite: 'lax' } as const;

export type Identity = Pick<
	CapiUserInput,
	'fbp' | 'fbc' | 'externalId' | 'hashed' | 'clientIpAddress' | 'clientUserAgent'
>;

/**
 * Makes sure this visitor carries the three identifiers every later event will
 * want, writing the ones that are missing. Call once per request, before the
 * response is resolved — `cookies.get` reads back what was just set, so
 * everything downstream in the same request sees them too.
 */
export function ensureIdentity(event: RequestEvent): void {
	const { cookies, url } = event;
	const now = Date.now();

	// A fresh `fbclid` is a fresh click, so it replaces whatever is there —
	// same as fbevents.js, and the reason attribution follows the latest ad
	// rather than the first one this browser ever saw. Persisting it is what
	// makes `fbc` survive past the landing URL when their script never ran.
	const fbclid = url.searchParams.get('fbclid');
	if (fbclid) {
		cookies.set(FBC_COOKIE, buildFbc(fbclid, now), { ...METAS, maxAge: CLICK_COOKIE_MAX_AGE });
	}

	// Only when absent: their script keeps an existing valid `_fbp` rather than
	// replacing it, so minting one here gives the blocked half of an audience a
	// browser id and costs the unblocked half nothing.
	if (!cookies.get(FBP_COOKIE)) {
		cookies.set(FBP_COOKIE, newFbp(now), { ...METAS, maxAge: CLICK_COOKIE_MAX_AGE });
	}

	if (!cookies.get(VISITOR_COOKIE)) {
		cookies.set(VISITOR_COOKIE, crypto.randomUUID(), { ...OURS, maxAge: VISITOR_MAX_AGE });
	}
}

/**
 * Reads only — no cookie is written here, so this is safe on the paths that
 * have no page to set one from: the tracking beacon, the checkout action.
 */
export function identityFrom(
	cookies: Pick<Cookies, 'get'>,
	url: URL,
	headers: Headers,
	clientIpAddress?: string
): Identity {
	const fbclid = url.searchParams.get('fbclid');
	return {
		fbp: cookies.get(FBP_COOKIE),
		// The fallback still matters: a request can reach here before anything
		// set the cookie, and a click id beats no click id.
		fbc: cookies.get(FBC_COOKIE) ?? (fbclid ? buildFbc(fbclid, Date.now()) : undefined),
		externalId: cookies.get(VISITOR_COOKIE),
		hashed: readMatch(cookies.get(MATCH_COOKIE)),
		clientIpAddress,
		clientUserAgent: headers.get('user-agent') ?? undefined
	};
}

/**
 * Remembers the customer for the events after this one, hashed.
 *
 * A PageView two days later is the event this exists for: on its own it knows
 * nobody, and Meta scores it accordingly. Only the digests are stored — the
 * cookie is readable by anything that gets at the browser's storage, and a
 * plaintext email in there is a leak in a way a digest of one is not. It is
 * also exactly what the Conversions API wants, so nothing has to un-hash it.
 */
export async function rememberCustomer(
	cookies: Pick<Cookies, 'set'>,
	customer: { email?: string; phone?: string }
): Promise<void> {
	const hashed = await buildUserData({ email: customer.email, phone: customer.phone });
	const value = [first(hashed.em), first(hashed.ph)].join('.');
	// '.' alone means both were missing — nothing worth a cookie.
	if (value === '.') return;

	cookies.set(MATCH_COOKIE, value, { ...OURS, maxAge: MATCH_MAX_AGE });
}

/**
 * The advanced-matching object for `fbq('init', …)`.
 *
 * Hashed, never plaintext: this is inlined into the page, where an email would
 * be readable by every script on it and by anything that caches the HTML. Meta
 * reads a 64-character hex string as already hashed and passes it through.
 *
 * Built by the same `buildUserData` that fills the server's `user_data`, so the
 * two halves cannot normalize the same person differently and stop matching —
 * which they would do silently, and only Events Manager would ever say so.
 */
export async function advancedMatching(identity: Identity): Promise<Record<string, string>> {
	const userData = await buildUserData({
		externalId: identity.externalId,
		hashed: identity.hashed
	});

	const matching: Record<string, string> = {};
	for (const key of ['em', 'ph', 'external_id'] as const) {
		const hash = first(userData[key]);
		if (hash) matching[key] = hash;
	}
	return matching;
}

function first(value: string[] | string | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/** `<email hash>.<phone hash>`, either side allowed to be empty. */
function readMatch(value: string | undefined): Identity['hashed'] {
	if (!value) return undefined;
	const [email, phone] = value.split('.');
	// Shape only. `buildUserData` is what decides a hash is usable, so a
	// tampered cookie drops the field there rather than reaching Meta.
	return email || phone ? { email: email || undefined, phone: phone || undefined } : undefined;
}
