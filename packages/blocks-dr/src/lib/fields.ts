/**
 * Shared field registry for the form blocks.
 *
 * The autocomplete tokens are the substance here. Getting them right is what
 * lets a phone fill a checkout in one tap, and it moves completion further than
 * anything visual in these blocks does.
 */

export type InputMode = 'search' | 'none' | 'email' | 'decimal' | 'text' | 'url' | 'tel' | 'numeric';

export type Field = {
	name: string;
	label?: string;
	type?: string;
	autocomplete?: AutoFill;
	inputmode?: InputMode;
	placeholder?: string;
	required?: boolean;
	/** Pairs with an adjacent `half` field on one row. Full width on a phone. */
	half?: boolean;
	options?: string[];
};

export type FieldName =
	| 'fullName'
	| 'firstName'
	| 'lastName'
	| 'email'
	| 'phone'
	| 'address'
	| 'address2'
	| 'country'
	| 'city'
	| 'state'
	| 'zip';

export const FIELDS: Record<FieldName, Field> = {
	fullName: { name: 'fullName', label: 'Full name', autocomplete: 'name', required: true },
	firstName: { name: 'firstName', label: 'First name', autocomplete: 'given-name', required: true, half: true },
	lastName: { name: 'lastName', label: 'Last name', autocomplete: 'family-name', required: true, half: true },
	email: {
		name: 'email',
		label: 'Email',
		type: 'email',
		autocomplete: 'email',
		inputmode: 'email',
		required: true
	},
	phone: { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
	country: { name: 'country', label: 'Country', autocomplete: 'country-name', required: true },
	address: { name: 'address', label: 'Address line 1', autocomplete: 'address-line1', required: true },
	address2: { name: 'address2', label: 'Address line 2', autocomplete: 'address-line2' },
	city: { name: 'city', label: 'City', autocomplete: 'address-level2', required: true, half: true },
	/**
	 * No numeric inputmode: UK and Canadian postcodes contain letters, and a
	 * number pad makes them unenterable.
	 */
	zip: { name: 'zip', label: 'ZIP', autocomplete: 'postal-code', required: true, half: true },
	state: { name: 'state', label: 'State', autocomplete: 'address-level1', required: true }
};

/** Resolve a manifest's `fields` (names or partial descriptors) to full ones. */
export function resolveFields(
	input: (FieldName | Field | string)[] | undefined,
	fallback: FieldName[]
): Field[] {
	return (input ?? fallback).map((f) =>
		typeof f === 'string'
			? (FIELDS[f as FieldName] ?? { name: f, label: f })
			: { ...(FIELDS[f.name as FieldName] ?? {}), ...f }
	);
}
