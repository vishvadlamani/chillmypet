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
	/**
	 * A stable id for this visitor in your own system — a first-party cookie, a
	 * customer id. Hashed like the contact fields. It is the one identifier you
	 * can send on every event, including the first anonymous PageView, so it is
	 * what ties a visitor's browsing to the purchase that comes later.
	 */
	externalId?: string;
	/** These four must NOT be hashed. */
	clientIpAddress?: string;
	clientUserAgent?: string;
	fbp?: string;
	fbc?: string;
};

export type HashedUserData = Record<string, string[] | string>;

/**
 * A value that is already a SHA-256 digest. Passed through untouched, the way
 * Meta's own SDKs do it: a host that stores contact details only as hashes (in a
 * cookie, say) can send them without ever holding the plaintext again.
 * Normalizing one first would destroy it — phone normalization strips letters.
 */
const SHA256_HEX = /^[a-f0-9]{64}$/;

export async function buildUserData(input: CapiUserInput): Promise<HashedUserData> {
	const fields: [string, string | undefined, (v: string) => string][] = [
		['em', input.email, normalize.email],
		['ph', input.phone, normalize.phone],
		['fn', input.firstName, normalize.name],
		['ln', input.lastName, normalize.name],
		['ct', input.city, normalize.city],
		['st', input.state, normalize.state],
		['zp', input.zip, normalize.zip],
		['country', input.country, normalize.country],
		['external_id', input.externalId, (v) => v.trim()]
	];

	const userData: HashedUserData = {};

	for (const [key, raw, clean] of fields) {
		if (!raw) continue;
		if (SHA256_HEX.test(raw)) {
			userData[key] = [raw];
			continue;
		}
		const value = clean(raw);
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
 * A browser id in the `_fbp` format, for a host to set before Meta's script has.
 *
 * The pixel only creates `_fbp` once `fbevents.js` runs in the browser, which
 * is after the first page's server-side PageView has already gone without one.
 * The pixel adopts an `_fbp` cookie it finds rather than minting its own, so a
 * value set here identifies the browser to both halves from the first request.
 */
export function buildFbp(createdAt: number, random = Math.floor(Math.random() * 2 ** 31)): string {
	return `fb.1.${createdAt}.${random}`;
}

/** The click id inside an `_fbc` value, or undefined when it is not one. */
export function fbclidOf(fbc: string | undefined): string | undefined {
	return fbc?.match(/^fb\.\d+\.\d+\.(.+)$/)?.[1];
}
