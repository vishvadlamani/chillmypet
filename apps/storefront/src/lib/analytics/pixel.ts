import { browser } from '$app/environment';
import type { MetaCustomData, MetaEventName } from 'ecomwithai/marketing';

declare global {
	interface Window {
		fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
	}
}

/**
 * Where the server half of a browser event is posted.
 *
 * Deliberately not `/api/track`: generic privacy blocklists match paths
 * containing "track", first-party ones included, and this beacon exists
 * precisely to be the copy that still arrives when the pixel was blocked.
 */
const BRIDGE = '/api/events';

/**
 * Browser-side pixel events, each with its server-side twin.
 *
 * Every event goes out twice: once through `fbq`, and once through `/api/events`
 * so the Conversions API sends the same event from the server, where iOS and ad
 * blockers cannot eat it. Both carry the same `eventID`, which is the only
 * reason Meta counts one event instead of two.
 *
 * The id is minted here rather than on the server because only the browser knows
 * that these two calls are the same moment — nothing server-side can tell one
 * page view from the next. Purchase is the exception and passes its own id in:
 * that one is derived from the order number, because its two halves are a
 * webhook and a receipt page that never meet.
 */
export function track(event: MetaEventName, data?: MetaCustomData, eventId?: string): string {
	const id = eventId ?? newEventId();
	if (!browser) return id;

	if (typeof window.fbq === 'function') {
		// Plain `track`, never `trackSingle`: every pixel measuring this store is
		// initialised by the one snippet, so this gives each of them exactly one.
		window.fbq('track', event, data ?? {}, { eventID: id });
	}

	// Purchase's server copy is sent by the Stripe webhook, from an order row
	// that was actually paid. Asking for one here would let a page — anyone's
	// page — write revenue into the ad account.
	if (event !== 'Purchase') sendServerCopy(event, id, data);

	return id;
}

/**
 * The server half on its own, for an event whose browser half already fired.
 *
 * The first PageView of a visit comes from the base snippet in `app.html`, which
 * runs before this module is even parsed. Its id is minted server-side and
 * handed back through page data, so the pair still dedupes — this sends the
 * matching server event without firing a second `fbq` call.
 */
export function trackServerOnly(event: MetaEventName, eventId: string, data?: MetaCustomData): void {
	if (!browser || event === 'Purchase') return;
	sendServerCopy(event, eventId, data);
}

export function newEventId(): string {
	// Older Safari has `crypto` without `randomUUID`. A missing id is worse than
	// a weaker one: it means the server copy is dropped and the browser event
	// gets counted on its own.
	if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
	return `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Never throws and never blocks: an analytics call must not be able to break a
 * page, and the customer must not wait on it. `sendBeacon` survives the
 * navigation that an `AddToCart` immediately triggers; `keepalive` is the same
 * promise where it isn't available.
 */
function sendServerCopy(event: MetaEventName, eventId: string, data?: MetaCustomData): void {
	const body = JSON.stringify({
		eventName: event,
		eventId,
		eventSourceUrl: location.href,
		customData: data ?? {}
	});

	try {
		if (typeof navigator?.sendBeacon === 'function') {
			// A typed Blob, so this arrives as JSON rather than as the `text/plain`
			// a bare string would send — which SvelteKit's CSRF check rejects.
			const queued = navigator.sendBeacon(BRIDGE, new Blob([body], { type: 'application/json' }));
			if (queued) return;
		}
		void fetch(BRIDGE, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			keepalive: true
		}).catch(() => {});
	} catch {
		// A blocked beacon, a full queue, a page mid-unload. Nothing to do.
	}
}
