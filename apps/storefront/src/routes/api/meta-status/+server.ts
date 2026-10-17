import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { CapiVerification } from 'ecomwithai';

/**
 * Whether this deployment's Conversions API copies can land, readable from a
 * browser: https://chillmypet.com/api/meta-status.
 *
 * Every server event is sent with the browser's `event_id`, so when Events
 * Manager still reports server events without a dedupe key and no coverage, the
 * usual cause is that the server half is not arriving at all. A token generated
 * for another dataset is refused once per event into `console.error`, the
 * browser half keeps arriving, and nothing outside the Worker's logs says so.
 * `meta:check` proves the repository secret; this proves the one the deployed
 * Worker actually holds, which can differ and cannot be read back.
 *
 * It asks Meta with an empty batch, so it sends no event. The token is never in
 * the response. 503 when the server half cannot land, so an uptime monitor can
 * watch it.
 */

// One answer per isolate per store for a few minutes: this is a public URL, and
// each uncached hit is a call to the Graph API. Not in dev, where the token is
// swapped while you watch and a cached verdict would describe the last one.
const TTL_MS = dev ? 0 : 5 * 60 * 1000;
const cache = new Map<string, { at: number; result: CapiVerification }>();

export const GET: RequestHandler = async ({ locals }) => {
	const meta = locals.commerce.meta;
	const headers = { 'cache-control': 'no-store' };
	if (!meta) {
		return json({ dataset: null, server_events: 'no_pixel' }, { status: 503, headers });
	}

	const key = locals.store.id;
	let entry = cache.get(key);
	if (!entry || Date.now() - entry.at >= TTL_MS) {
		entry = { at: Date.now(), result: await meta.verify() };
		cache.set(key, entry);
	}

	const { result } = entry;
	return json(
		{
			dataset: meta.pixelId,
			server_events: result.ok ? 'accepted' : result.reason,
			...(result.ok || !result.detail ? {} : { detail: result.detail }),
			checked_at: new Date(entry.at).toISOString()
		},
		{ status: result.ok ? 200 : 503, headers }
	);
};
