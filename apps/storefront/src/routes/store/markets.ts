/**
 * Where the store ships.
 *
 * One source for two consumers that must not disagree: the country select shows
 * `names`, the address lookup biases suggestions by `codes`. Written twice they
 * drift, and the failure is quiet — suggestions for a country the select can't
 * offer, so the visitor picks an address the form then rejects.
 */

export interface Markets {
	/** Display names, in the order the select should list them. */
	names: string[];
	/** ISO alpha-2, for biasing address suggestions. */
	codes: string[];
}

export function loadMarkets(): Markets {
	return {
		names: ['United States', 'Canada', 'United Kingdom', 'Australia'],
		codes: ['us', 'ca', 'gb', 'au']
	};
}
