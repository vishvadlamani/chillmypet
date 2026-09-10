import { browser } from '$app/environment';
import { newEventId, type MetaCustomData, type MetaEventName } from 'ecomwithai/marketing';

declare global {
	interface Window {
		fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
	}
}

/**
 * Purchase is reported server-side from the order itself — the Stripe webhook,
 * or the checkout action with payments off — so mirroring it from here would
 * put a third copy of a sale on a public endpoint for no gain. Everything else
 * only exists in the browser until this sends it.
 */
const MIRRORED: readonly MetaEventName[] = [
	'PageView',
	'ViewContent',
	'AddToCart',
	'InitiateCheckout',
	'AddPaymentInfo'
];

/**
 * Posts the server's copy of an event the browser just fired.
 *
 * `keepalive` because the two events worth most fire as the page is leaving:
 * InitiateCheckout right before a navigation, AddPaymentInfo as the form
 * submits. A normal fetch is cancelled on unload and those are exactly the ones
 * that would go missing.
 */
function mirror(event: MetaEventName, eventId: string, data?: MetaCustomData): void {
	if (!MIRRORED.includes(event)) return;
	void fetch('/api/track', {
		method: 'POST',
		keepalive: true,
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			eventName: event,
			eventId,
			eventSourceUrl: window.location.href,
			customData: data ?? {}
		})
		// A beacon must never surface on the page it was fired from.
	}).catch(() => {});
}

/**
 * Browser-side pixel events, plus their Conversions API copy.
 *
 * The base snippet is injected per store in hooks.server.ts, so it loads before
 * hydration; this only pushes onto it.
 *
 * Both halves carry the same `eventId`, which is what Meta dedupes on. Purchase
 * passes one derived from the order number, because its server half is sent
 * from a different request that cannot be handed a value; everything else mints
 * one here and hands it straight to both.
 */
export function track(event: MetaEventName, data?: MetaCustomData, eventId?: string): void {
	if (!browser || typeof window.fbq !== 'function') return;

	const id = eventId ?? newEventId();
	window.fbq('track', event, data ?? {}, { eventID: id });
	mirror(event, id, data);
}
