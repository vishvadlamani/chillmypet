/**
 * Shapes exchanged between the address field and its host endpoint.
 *
 * A plain module, not types inside the component, so the endpoint on the server
 * and the field in the browser can be checked against the same contract — the
 * point of the seam is that neither side knows Google's schema.
 *
 * Field names match `fields.ts` exactly, because a resolved address is written
 * straight into host state under these keys and the field group reads it back
 * by the same names.
 */

export interface AddressSuggestion {
	/** Provider's opaque id, passed back to fetch the full address. */
	id: string;
	/** Emphasised part — "7511 120 Street". */
	main: string;
	/** Muted remainder — "Delta, BC, Canada". */
	secondary: string;
}

export interface ResolvedAddress {
	address: string;
	address2: string;
	city: string;
	state: string;
	zip: string;
	country: string;
}

/** What `GET {endpoint}?q=…` returns. */
export interface SuggestResponse {
	/** False when no provider is configured or it failed — fall back to manual. */
	available: boolean;
	suggestions?: AddressSuggestion[];
}

/** What `GET {endpoint}?place=…` returns. */
export interface DetailsResponse {
	available: boolean;
	address?: ResolvedAddress | null;
}
