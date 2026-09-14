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
	},
	/**
	 * An id of our own. Meta has no format to impose here, so the only rule that
	 * matters is that the same person normalizes to the same string every time —
	 * trim and lowercase, and never anything lossy.
	 */
	externalId: (v: string) => v.trim().toLowerCase()
};

/**
 * Meta reads a 64-character lowercase hex string as a value that is already
 * hashed, and anything else as plaintext to hash itself. So a malformed hash is
 * not a near miss: it is sent, hashed a second time, and matches nobody. Values
 * that fail this are omitted, on the same reasoning as a truncated state code.
 */
export function isSha256Hex(value: string): boolean {
	return /^[0-9a-f]{64}$/.test(value);
}

export type CapiUserInput = {
	email?: string;
	phone?: string;
	firstName?: string;
	lastName?: string;
	city?: string;
	state?: string;
	zip?: string;
	country?: string;
	/**
	 * An id of our own for this person, stable across visits. Meta scores it as
	 * a matching signal like any other, and it is the only one an anonymous
	 * visitor carries — which is what makes it the field worth having on
	 * PageView, where there is no email and no phone to send.
	 */
	externalId?: string;
	/**
	 * Values already normalized and SHA-256 hashed by the caller, for identity
	 * held somewhere that should never hold the plaintext — a cookie remembering
	 * a customer between visits, say. Each is ignored where the raw field above
	 * is also set, so an order's own email always wins over a remembered one.
	 */
	hashed?: {
		email?: string;
		phone?: string;
		externalId?: string;
	};
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
		['country', input.country && normalize.country(input.country)],
		['external_id', input.externalId && normalize.externalId(input.externalId)]
	];

	const userData: HashedUserData = {};

	for (const [key, value] of fields) {
		// Omit empty keys rather than sending `[null]` — a null entry carries no
		// signal and drags down the reported match quality.
		if (!value) continue;
		userData[key] = [await sha256Hex(value)];
	}

	// Fill only what the raw fields left empty: a value the caller hashed is a
	// remembered one, and whatever this event knows first-hand describes the
	// person doing it better than a cookie from an earlier visit does.
	const preHashed: [string, string | undefined][] = [
		['em', input.hashed?.email],
		['ph', input.hashed?.phone],
		['external_id', input.hashed?.externalId]
	];

	for (const [key, value] of preHashed) {
		if (!value || userData[key] || !isSha256Hex(value)) continue;
		userData[key] = [value];
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
 * A `_fbp` value in Meta's own format, for when their script never set one —
 * which is every visitor running a blocker, and they are not a small share.
 *
 * `fb.<subdomain-index>.<created-ms>.<random>`, the same four segments
 * fbevents.js writes, so their script adopts this one rather than replacing it
 * and the browser and server halves of an event agree on the browser id.
 */
export function newFbp(createdAt: number): string {
	const [random] = crypto.getRandomValues(new Uint32Array(1));
	return `fb.1.${createdAt}.${random}`;
}
