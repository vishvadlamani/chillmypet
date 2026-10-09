/**
 * Advanced-matching normalization and hashing for Meta's Conversions API.
 *
 * Pure and dependency-free so it can be unit-tested directly — getting these
 * rules wrong never errors, it just produces hashes that silently never match.
 * Rules come from Meta's customer-information-parameters documentation.
 */

export async function sha256Hex(value: string): Promise<string> {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const normalize = {
	/** Trim, lowercase. */
	email: (v: string) => v.trim().toLowerCase(),
	/** Digits only, country code included, leading zeros dropped. */
	phone: (v: string) => v.replace(/\D/g, '').replace(/^0+/, ''),
	/** Lowercase, no punctuation; unicode letters preserved. */
	name: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''),
	/** Lowercase, no punctuation or spaces. */
	city: (v: string) => v.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''),
	/**
	 * Two-character ANSI code, lowercase. Anything else returns '' so the field
	 * is omitted: truncating "Texas" to "te" would hash to a code that matches
	 * nobody, which is strictly worse than sending no state at all.
	 */
	state: (v: string) => {
		const cleaned = v.trim().toLowerCase().replace(/[^a-z]/g, '');
		return cleaned.length === 2 ? cleaned : '';
	},
	/** Lowercase, no spaces or dashes; US ZIP+4 truncated to 5. */
	zip: (v: string) => {
		const cleaned = v.trim().toLowerCase().replace(/[\s-]/g, '');
		return /^\d{9}$/.test(cleaned) ? cleaned.slice(0, 5) : cleaned;
	},
	/** ISO 3166-1 alpha-2, lowercase; same omit-rather-than-truncate rule. */
	country: (v: string) => {
		const cleaned = v.trim().toLowerCase().replace(/[^a-z]/g, '');
		return cleaned.length === 2 ? cleaned : '';
	}
};

export type CapiUserInput = {
	email?: string;
	phone?: string;
	firstName?: string;
	lastName?: string;
	city?: string;
	state?: string;
	zip?: string;
	country?: string;
	/** These four must NOT be hashed. */
	clientIpAddress?: string;
	clientUserAgent?: string;
	fbp?: string;
	fbc?: string;
};

export type HashedUserData = Record<string, string[] | string>;

export async function buildUserData(input: CapiUserInput): Promise<HashedUserData> {
	const fields: [string, string | undefined][] = [
		['em', input.email && normalize.email(input.email)],
		['ph', input.phone && normalize.phone(input.phone)],
		['fn', input.firstName && normalize.name(input.firstName)],
		['ln', input.lastName && normalize.name(input.lastName)],
		['ct', input.city && normalize.city(input.city)],
		['st', input.state && normalize.state(input.state)],
		['zp', input.zip && normalize.zip(input.zip)],
		['country', input.country && normalize.country(input.country)]
	];

	const userData: HashedUserData = {};

	for (const [key, value] of fields) {
		// Omit empty keys rather than sending `[null]` — a null entry carries no
		// signal and drags down the reported match quality.
		if (!value) continue;
		userData[key] = [await sha256Hex(value)];
	}

	if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
	if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
	if (input.fbp) userData.fbp = input.fbp;
	if (input.fbc) userData.fbc = input.fbc;

	return userData;
}

/** The `fbc` value Meta expects when a visitor lands with `?fbclid=`. */
export function buildFbc(fbclid: string, createdAt: number): string {
	return `fb.1.${createdAt}.${fbclid}`;
}

/**
 * The `fbc` for an event on a page whose URL may carry a `fbclid`.
 *
 * A click id on the URL beats the `_fbc` cookie when the two disagree. The
 * cookie still holds an earlier click until Meta's script rewrites it, and
 * sending that next to a URL carrying the new one is what Events Manager flags
 * as a modified fbclid — it compares the two, and a stale id reads as tampered.
 * When they agree the cookie is kept, so its original timestamp survives.
 */
export function resolveFbc(
	cookie: string | undefined,
	fbclid: string | null | undefined,
	now: number
): string | undefined {
	if (!fbclid) return cookie || undefined;
	if (cookie?.split('.')[3] === fbclid) return cookie;
	return buildFbc(fbclid, now);
}
