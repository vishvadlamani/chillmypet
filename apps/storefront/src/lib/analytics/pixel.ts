import { browser } from '$app/environment';
import type { MetaCustomData, MetaEventName } from 'ecomwithai/marketing';

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

/**
 * One PageView, for the store's pixel only.
 *
 * SvelteKit navigates without reloading the document, so the snippet in
 * `app.html` fires once per session and every navigation after that is reported
 * from here. Scoped with `trackSingle`: a page that has attached a second pixel
 * would otherwise count a single navigation on both, and each extra pixel
 * already reports its own arrival when it initialises.
 *
 * Falls back to a plain `track` when the store has no pixel id to name, which
 * is the same behaviour as before pixels could be stacked.
 */
export function pageView(storePixelId?: string): void {
	if (!browser || typeof window.fbq !== 'function') return;

	if (storePixelId && /^\d{1,20}$/.test(storePixelId)) {
		window.fbq('trackSingle', storePixelId, 'PageView');
	} else {
		window.fbq('track', 'PageView');
	}
}

/** Pixels this page view has already initialised, so a revisit doesn't re-init. */
const started = new Set<string>();

/**
 * Adds a second pixel to a page.
 *
 * The store's own pixel is injected by `hooks.server.ts` and loads before
 * hydration; this attaches another one — a different ad account measuring the
 * same checkout — to the loader that is already there. If that loader is
 * missing (the store has no pixel configured, or a blocker ate the script), the
 * standard snippet is injected first.
 *
 * `trackSingle`, not `track`, for the PageView: once two pixels are
 * initialised a plain `track` reports to both, and the store's pixel already
 * counted this page from the base snippet. A second one inflates its PageViews
 * on every checkout — the metric an ad account measures landing-page cost
 * against.
 *
 * Conversions are deliberately NOT scoped: `track('InitiateCheckout')` and
 * `track('Purchase')` keep reporting to every initialised pixel, which is the
 * point of putting a second one on the checkout at all.
 */
export function addPixel(pixelId: string): void {
	// Guards against a database value reaching the page as markup or as a call.
	if (!browser || !/^\d{1,20}$/.test(pixelId) || started.has(pixelId)) return;
	started.add(pixelId);

	if (typeof window.fbq !== 'function') injectBaseSnippet();
	if (typeof window.fbq !== 'function') return;

	window.fbq('init', pixelId);
	window.fbq('trackSingle', pixelId, 'PageView');
}

/** Meta's loader, verbatim, for pages that reach here without one. */
function injectBaseSnippet(): void {
	/* eslint-disable */
	// prettier-ignore
	(function (f: any, b: Document, e: string, v: string, n?: any, t?: any, s?: any) {
		if (f.fbq) return;
		n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
		if (!f._fbq) f._fbq = n;
		n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
		t = b.createElement(e); t.async = !0; t.src = v;
		s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
	})(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
	/* eslint-enable */
}
