/**
 * Where we ship to.
 *
 * The same list the checkout country select is built from, so a market offered
 * on the page is one the order will actually accept — `isCountryCode` rejects
 * anything outside it.
 */
import { countryOptions } from '$lib/countries';
import type { Locale } from '$lib/i18n';

export interface Markets {
	names: string[];
	codes: string[];
}

export function loadMarkets(locale: Locale): Markets {
	const options = countryOptions(locale);
	return {
		names: options.map((o) => o.name),
		// Lowercased for the block's flag lookup; the order action re-validates
		// against the canonical uppercase ISO list.
		codes: options.map((o) => o.code.toLowerCase())
	};
}
