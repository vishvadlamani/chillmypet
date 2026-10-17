/**
 * What the shop checkout's fields accept, and what each one says when it
 * doesn't.
 *
 * One place for both the inline messages the field blocks show and the check
 * `Checkout.svelte` runs before it posts, so a field can never be marked fine
 * while the pay button refuses it, or the reverse. The server checks again in
 * `placeOrder`; these rules are the same ones, stated for the page.
 *
 * Returns a language-pack key, not words: the page reads in one language.
 */
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ShopField =
	| 'email'
	| 'firstName'
	| 'lastName'
	| 'address'
	| 'city'
	| 'state'
	| 'zip'
	| 'country';

export type FieldProblem =
	| 'checkout.fieldErrors.email'
	| 'checkout.fieldErrors.emailInvalid'
	| 'checkout.fieldErrors.firstName'
	| 'checkout.fieldErrors.lastName'
	| 'checkout.fieldErrors.address'
	| 'checkout.fieldErrors.city'
	| 'checkout.fieldErrors.state'
	| 'checkout.fieldErrors.zip'
	| 'checkout.fieldErrors.country';

export function fieldProblem(
	field: ShopField,
	raw: string | undefined,
	options: { stateRequired?: boolean } = {}
): FieldProblem | null {
	const value = (raw ?? '').trim();
	switch (field) {
		case 'email':
			if (!value) return 'checkout.fieldErrors.email';
			return EMAIL.test(value) ? null : 'checkout.fieldErrors.emailInvalid';
		case 'state':
			// Per country: a UK address posts fine with no county.
			return options.stateRequired && !value ? 'checkout.fieldErrors.state' : null;
		default:
			return value ? null : (`checkout.fieldErrors.${field}` as FieldProblem);
	}
}
