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

const EMAIL_COOKIE = 'cmp_em';
const PHONE_COOKIE = 'cmp_ph';

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
 * Keeps the email and phone a shopper gave at checkout, so every later event
 * from this browser can carry them — the next visit's PageView and ViewContent
 * included. Only the SHA-256 digests are stored, in cookies script cannot read:
 * the plaintext lives in the order, and the cookie holds exactly what Meta
 * would be sent anyway.
 *
 * Written from the checkout action, never from `/api/track`: a public beacon
 * must not be able to claim an identity, but an order is where a shopper gives
 * us theirs.
 */
export async function rememberContact(
	cookies: Cookies,
	contact: { email: string; phone?: string; country?: string }
): Promise<void> {
	const options = { path: '/', maxAge: 90 * DAY, sameSite: 'lax', httpOnly: true } as const;

	const email = normalize.email(contact.email);
	if (email) cookies.set(EMAIL_COOKIE, await sha256Hex(email), options);

	const phone = contact.phone && normalize.phone(withCallingCode(contact.phone, contact.country));
	if (phone) cookies.set(PHONE_COOKIE, await sha256Hex(phone), options);
}

/**
 * The digests `rememberContact` stored, ready to pass as `email` and `phone` —
 * `buildUserData` sends a SHA-256 value as-is. A cookie that is not one is
 * ignored rather than hashed again.
 */
export function rememberedContact(cookies: { get(name: string): string | undefined }): {
	email?: string;
	phone?: string;
} {
	const email = cookies.get(EMAIL_COOKIE);
	const phone = cookies.get(PHONE_COOKIE);
	return {
		...(email && SHA256_HEX.test(email) ? { email } : {}),
		...(phone && SHA256_HEX.test(phone) ? { phone } : {})
	};
}
