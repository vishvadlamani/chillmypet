import type { Cookies } from '@sveltejs/kit';
import { normalize, sha256Hex } from 'ecomwithai/marketing';

/**
 * Who a visitor is, as far as Meta's matching is concerned — kept in first-party
 * cookies so the server can say it on every event, not just on Purchase.
 *
 * The Conversions API copy of an event is only as useful as the identifiers on
 * it. Before this, the first PageView went out with an IP and a user agent and
 * nothing else: `_fbp` did not exist yet because Meta's script had not run, there
 * was no visitor id at all, and an email or phone only ever reached Meta on the
 * sale itself. Events Manager scores that as poor match quality, and the ad
 * account optimizes against whatever it can match.
 */

/**
 * One cookie per field Meta matches on, each holding a digest. Name and
 * address are here as well as email and phone: without them only Purchase
 * carried a last name, and Events Manager flagged Last Name coverage on
 * PageView at 4.55%.
 */
const COOKIES = {
	email: 'cmp_em',
	phone: 'cmp_ph',
	firstName: 'cmp_fn',
	lastName: 'cmp_ln',
	city: 'cmp_ct',
	state: 'cmp_st',
	zip: 'cmp_zp',
	country: 'cmp_country'
} as const;

export type RememberedContact = Partial<Record<keyof typeof COOKIES, string>>;

const DAY = 60 * 60 * 24;
const SHA256_HEX = /^[a-f0-9]{64}$/;

// The visitor id itself is `ensureVisitorId` in `purchase.ts`: one cookie, one
// format, read by the pixel's init and every Conversions API copy alike.

/** Countries on the North American Numbering Plan this store ships to. */
const NANP = new Set(['US', 'CA', 'PR']);

/**
 * Meta matches phones only with the country code, and checkout takes whatever
 * the shopper typed — usually `(650) 555-1212`, which hashes to a number nobody
 * has. A leading `+` or `00` already carries the code; otherwise a ten-digit
 * NANP number gets its `1`. Anything else is sent as typed, because guessing a
 * code wrong is no better than leaving it off.
 */
export function withCallingCode(phone: string, country: string | undefined): string {
	const trimmed = phone.trim();
	if (/^(\+|00)/.test(trimmed)) return trimmed;
	const digits = trimmed.replace(/\D/g, '');
	if (country && NANP.has(country.toUpperCase()) && digits.length === 10) return `1${digits}`;
	return trimmed;
}

/**
 * Keeps the contact details a shopper gave at checkout, so every later event
 * from this browser can carry them — the next visit's PageView and ViewContent
 * included. Only the SHA-256 digests are stored, in cookies script cannot read:
 * the plaintext lives in the order, and the cookie holds exactly what Meta
 * would be sent anyway.
 *
 * Each field is normalized exactly as `buildUserData` would normalize it, so a
 * remembered digest equals the one Purchase sends for the same order. A field
 * that normalizes to nothing (a state written out in full, say) is not stored.
 *
 * Written from the checkout action, never from `/api/track`: a public beacon
 * must not be able to claim an identity, but an order is where a shopper gives
 * us theirs.
 */
export async function rememberContact(
	cookies: Cookies,
	contact: {
		email: string;
		phone?: string;
		firstName?: string;
		lastName?: string;
		city?: string;
		state?: string;
		zip?: string;
		country?: string;
	}
): Promise<void> {
	const options = { path: '/', maxAge: 90 * DAY, sameSite: 'lax', httpOnly: true } as const;

	const normalized: RememberedContact = {
		email: normalize.email(contact.email),
		phone: contact.phone && normalize.phone(withCallingCode(contact.phone, contact.country)),
		firstName: contact.firstName && normalize.name(contact.firstName),
		lastName: contact.lastName && normalize.name(contact.lastName),
		city: contact.city && normalize.city(contact.city),
		state: contact.state && normalize.state(contact.state),
		zip: contact.zip && normalize.zip(contact.zip),
		country: contact.country && normalize.country(contact.country)
	};

	for (const [field, value] of Object.entries(normalized) as [keyof typeof COOKIES, string][]) {
		if (value) cookies.set(COOKIES[field], await sha256Hex(value), options);
	}
}

/**
 * The digests `rememberContact` stored, ready to spread into a Conversions API
 * `user` — `buildUserData` sends a SHA-256 value as-is. A cookie that is not
 * one is ignored rather than hashed again.
 */
export function rememberedContact(cookies: {
	get(name: string): string | undefined;
}): RememberedContact {
	const out: RememberedContact = {};
	for (const [field, name] of Object.entries(COOKIES) as [keyof typeof COOKIES, string][]) {
		const value = cookies.get(name);
		if (value && SHA256_HEX.test(value)) out[field] = value;
	}
	return out;
}
