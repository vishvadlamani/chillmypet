import { browser } from '$app/environment';
import type { MetaCustomData, MetaEventName } from '@chillmypet/commerce/meta';

declare global {
	interface Window {
		fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
	}
}

/**
 * Browser-side pixel events. The base snippet is injected per store in
 * hooks.server.ts, so it loads before hydration; this only pushes onto it.
 *
 * `eventId` must match the `event_id` the server sends for the same action —
 * without it Meta counts the browser event and the CAPI event separately.
 */
export function track(event: MetaEventName, data?: MetaCustomData, eventId?: string): void {
	if (!browser || typeof window.fbq !== 'function') return;

	if (eventId) {
		window.fbq('track', event, data ?? {}, { eventID: eventId });
	} else {
		window.fbq('track', event, data ?? {});
	}
}
