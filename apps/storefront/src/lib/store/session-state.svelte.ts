import type { FunnelStateAdapter } from '@funnel/core';

/**
 * The funnel state the product pages and checkouts share, backed by
 * sessionStorage.
 *
 * Not a stub: the forms write every keystroke here, and a checkout that forgets
 * a half-typed address on a reload is a checkout people leave. One key across
 * the product page and both checkouts, so a colour and size chosen on one are
 * still chosen on the next.
 *
 * `bag` is `$state`, not a plain object. The adapter's reads are methods
 * precisely so a reactive host returns a live value on each call: blocks that
 * mirror another block's choice depend on that, and so do the host's own
 * summary, validation and hidden fields.
 */
const KEY = 'store-state';

export function sessionFunnelState(defaults: Record<string, string> = {}): {
	bag: Record<string, string>;
	state: FunnelStateAdapter;
} {
	const bag: Record<string, string> = $state(
		(() => {
			// The `typeof` sits inside the try because merely touching the global
			// throws a SecurityError where the browser blocks site data (Safari's
			// "Block All Cookies", some in-app browsers). Outside it, that crashed
			// the checkout on hydration and took the form fields with it.
			try {
				if (typeof sessionStorage === 'undefined') return {};
				return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
			} catch {
				return {};
			}
		})()
	);
	// Filled before any block mounts, because the field groups seed from state
	// once.
	for (const [field, value] of Object.entries(defaults)) {
		if (!bag[field] && value) bag[field] = value;
	}

	const persist = () => {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(bag));
		} catch {
			// Blocked or full: the state still lives in `bag` for this page view.
		}
	};

	const state: FunnelStateAdapter = {
		begin: () => {},
		get: (f) => bag[f] ?? '',
		set: (f, v) => {
			bag[f] = v;
			persist();
		},
		answer: (k) => bag[k] ?? '',
		setAnswer: (k, v) => {
			bag[k] = v;
			persist();
		},
		city: () => ''
	};

	return { bag, state };
}
