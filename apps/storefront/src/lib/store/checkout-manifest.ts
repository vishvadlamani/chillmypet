import type { FunnelDefinition } from '@funnel/core';

/**
 * The checkout page — who they are, then where it goes.
 *
 * That order is deliberate. Email is the cheapest field to give and the one
 * worth having if they abandon: an address with no email is a lost order you
 * can't follow up, an email with no address is a recoverable one.
 *
 * Payment is NOT here and is not a block. Unknown block types are skipped by
 * design, which on a page like this would render a checkout that looks complete
 * and silently cannot take money. Card entry stays code until a block can
 * declare itself required.
 */
export const CHECKOUT_PAGE: FunnelDefinition = {
	id: 'store-checkout',
	name: 'Store — checkout',
	layout: 'page',
	blocks: [
		{
			id: 'checkout-title',
			component: 'heading',
			version: 1,
			props: { text: { $ref: 'copy.title' }, level: 1, size: 'md', width: 'page' }
		},
		{
			id: 'contact',
			component: 'contact_form',
			version: 1,
			props: {
				// Copy that exists in the language packs is bound, not typed: this
				// store sells in two languages and a literal here is a checkout that
				// switches to English halfway down.
				heading: { $ref: 'copy.contact' },
				// Phone is omitted: it's the field people abandon on, and nothing in
				// this flow needs it. Add it back when a carrier asks for it.
				fields: ['fullName', 'email'],
				note: { $ref: 'copy.contactNote' }
			}
		},
		{
			id: 'shipping',
			component: 'shipping_form',
			version: 1,
			props: {
				heading: { $ref: 'copy.shipping' },
				countries: { $ref: 'markets.names' },
				// One field that expands into six once an address is chosen.
				lookup: { countries: { $ref: 'markets.codes' } },
				note: { $ref: 'copy.shippingNote' }
			}
		},
		{
			id: 'method',
			component: 'shipping_method',
			version: 1,
			// No rates, no chooser — better than an empty box above the pay button.
			requires: ['shipping.rates'],
			props: {
				heading: { $ref: 'copy.method' },
				options: { $ref: 'shipping.rates' },
				field: 'shippingMethod'
			}
		}
	]
};
