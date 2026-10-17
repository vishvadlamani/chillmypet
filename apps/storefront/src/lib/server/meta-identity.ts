import type { Cookies } from '@sveltejs/kit';
import { hashMatchKeys, isMatchKey, type CapiUserInput, type MatchKeys } from 'ecomwithai/marketing';

/**
 * A buyer's advanced-matching keys, remembered from their order so every event
 * after it can be matched to them too.
 *
 * Without this only Purchase carries a name, email or address. Every PageView
 * and funnel event from someone who has already bought goes to Meta with only
 * cookies, IP and user agent, which Events Manager flags as low Last Name
 * coverage on PageView.
 *
 * The cookie holds the SHA-256 hashes Meta receives anyway, never raw values,
 * and is httpOnly, so page scripts cannot read it. It is a claim, the same as
 * advanced matching in the browser pixel: a visitor who edits it only changes
 * how their own events are matched.
 */
export const MATCH_COOKIE = 'cmp_mk';

/** As long as `_fbp`, so a remembered buyer is forgotten when the browser id is. */
const MAX_AGE = 60 * 60 * 24 * 90;

/** Never throws: an order is already committed when this runs. */
export async function rememberBuyer(cookies: Cookies, url: URL, buyer: CapiUserInput): Promise<void> {
	try {
		const keys = await hashMatchKeys(buyer);
		const value = Object.entries(keys)
			.map(([key, hash]) => `${key}:${hash}`)
			.join('.');
		if (!value) return;

		cookies.set(MATCH_COOKIE, value, {
			path: '/',
			maxAge: MAX_AGE,
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:'
		});
	} catch (error) {
		console.error('Remembering buyer match keys failed', error);
	}
}

/** Only keys Meta reads, each shaped like a SHA-256 hash; anything else is dropped. */
export function rememberedMatchKeys(cookies: Cookies): MatchKeys {
	const keys: MatchKeys = {};
	for (const pair of (cookies.get(MATCH_COOKIE) ?? '').split('.')) {
		const [key, hash] = pair.split(':');
		if (key && isMatchKey(key, hash)) keys[key] = hash;
	}
	return keys;
}
