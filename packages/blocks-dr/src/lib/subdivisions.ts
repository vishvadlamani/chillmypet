/**
 * Country subdivisions, and what the fields around them are called.
 *
 * A state dropdown is right where a canonical list exists and wrong where it
 * doesn't. The UK has no state — offering "Province" with a fixed list there
 * produces an address nobody can post to, and the same is true across most of
 * Europe and Asia. So this is a lookup, not a global list: countries in here get
 * a select, countries that aren't get a text input.
 *
 * Codes are the stored value, names are the label. Carriers, tax engines and
 * Stripe all want `BC`, not `British Columbia`, and normalising once at entry is
 * cheaper than guessing later from a string someone typed.
 */

export interface Subdivision {
	code: string;
	name: string;
}

export interface CountryForm {
	/** What the subdivision is called here — State, Province, County… */
	stateLabel: string;
	/** What the postcode is called here. */
	zipLabel: string;
	/** Empty means free text: no canonical list, or none used in addresses. */
	subdivisions: Subdivision[];
	/** Some countries genuinely don't use a subdivision in postal addresses. */
	stateRequired: boolean;
}

const US: Subdivision[] = [
	['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
	['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
	['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'],
	['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
	['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'],
	['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'],
	['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
	['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'],
	['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'],
	['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'],
	['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
	['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
	// Territories ship on USPS domestic rates; leaving them out reads as "we
	// don't deliver to Puerto Rico".
	['PR', 'Puerto Rico'], ['VI', 'U.S. Virgin Islands'], ['GU', 'Guam'], ['AS', 'American Samoa'],
	['MP', 'Northern Mariana Islands'], ['AA', 'Armed Forces Americas'],
	['AE', 'Armed Forces Europe'], ['AP', 'Armed Forces Pacific']
].map(([code, name]) => ({ code, name }));

const CA: Subdivision[] = [
	['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
	['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
	['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
	['SK', 'Saskatchewan'], ['YT', 'Yukon']
].map(([code, name]) => ({ code, name }));

const AU: Subdivision[] = [
	['ACT', 'Australian Capital Territory'], ['NSW', 'New South Wales'],
	['NT', 'Northern Territory'], ['QLD', 'Queensland'], ['SA', 'South Australia'],
	['TAS', 'Tasmania'], ['VIC', 'Victoria'], ['WA', 'Western Australia']
].map(([code, name]) => ({ code, name }));

/** Keyed by ISO alpha-2 AND by common English name, since both turn up. */
const FORMS: Record<string, CountryForm> = {
	US: { stateLabel: 'State', zipLabel: 'ZIP code', subdivisions: US, stateRequired: true },
	CA: { stateLabel: 'Province', zipLabel: 'Postal code', subdivisions: CA, stateRequired: true },
	AU: { stateLabel: 'State', zipLabel: 'Postcode', subdivisions: AU, stateRequired: true },
	// Free text, and optional: UK addresses post fine without a county, and
	// requiring one is a checkout that rejects valid addresses.
	GB: { stateLabel: 'County', zipLabel: 'Postcode', subdivisions: [], stateRequired: false },
	IE: { stateLabel: 'County', zipLabel: 'Eircode', subdivisions: [], stateRequired: false },
	NZ: { stateLabel: 'Region', zipLabel: 'Postcode', subdivisions: [], stateRequired: false },
	DE: { stateLabel: 'State', zipLabel: 'Postal code', subdivisions: [], stateRequired: false },
	FR: { stateLabel: 'Region', zipLabel: 'Postal code', subdivisions: [], stateRequired: false }
};

const ALIASES: Record<string, string> = {
	'united states': 'US',
	'united states of america': 'US',
	usa: 'US',
	canada: 'CA',
	australia: 'AU',
	'united kingdom': 'GB',
	uk: 'GB',
	'great britain': 'GB',
	ireland: 'IE',
	'new zealand': 'NZ',
	germany: 'DE',
	france: 'FR'
};

const DEFAULT_FORM: CountryForm = {
	stateLabel: 'State / Province',
	zipLabel: 'Postal code',
	subdivisions: [],
	stateRequired: false
};

/** Resolve a country as a code or a name to its form. Unknown → free text. */
export function countryForm(country: string | undefined): CountryForm {
	if (!country) return DEFAULT_FORM;
	const raw = country.trim();
	const key = raw.length === 2 ? raw.toUpperCase() : ALIASES[raw.toLowerCase()];
	return (key && FORMS[key]) || DEFAULT_FORM;
}

/**
 * Coerce whatever arrived into the stored code.
 *
 * This is the one that stops a silent bug: the address provider returns
 * "British Columbia", the select's options are keyed `BC`, and without
 * normalising, an autocompleted address renders an EMPTY province field — which
 * reads as "the form lost my data" and, worse, ships if nobody notices.
 */
export function toSubdivisionCode(country: string | undefined, value: string | undefined): string {
	if (!value) return '';
	const { subdivisions } = countryForm(country);
	if (!subdivisions.length) return value;
	const v = value.trim().toLowerCase();
	const hit = subdivisions.find((s) => s.code.toLowerCase() === v || s.name.toLowerCase() === v);
	return hit ? hit.code : value;
}
