/**
 * The Pouch Pet Hoodie — the owner wears it, and a cat or small dog rides in
 * the front pouch.
 *
 * English only, on the owner's instruction. Other locales fall back to this
 * row (`catalog.translation()` tries the store default next), so a Spanish
 * visitor reads English rather than a blank title.
 *
 * Sizes are the WEARER'S, XS–XL. No size chart is seeded: the store has no
 * manufacturer measurements for this garment yet, and AGENTS.md is explicit
 * that a chart is the supplier's table or nothing. The page drops its chart
 * section until a `specs.size_chart` metafield exists.
 *
 * There is no compare-at price on purpose. A struck-through "was" price has to
 * be one the product was actually offered at, and this one launches at $49.
 */

export const HOODIE_SLUG = 'pouch-pet-hoodie';

const PRICE_CENTS = 4900;

/**
 * Per-variant units. Stock is maintained outside this system, so this is a
 * ceiling `orders.create()` decrements against, not a count of anything real.
 * Raise it when the supplier says more is available.
 */
const STOCK = 25;

// The four the landing page at chillmypet-hoodie.pages.dev sells, same names and
// swatches, so a shopper who moves between the two sees one product. (Lotus was
// built first and held back by the owner; it is in this file's history.)
const COLOURS = [
	{ code: 'black', label: 'Black', hex: '#1c1c1c' },
	{ code: 'gray', label: 'Gray', hex: '#8c8c8c' },
	{ code: 'pink', label: 'Pink', hex: '#f0a9b8' },
	{ code: 'cream', label: 'Cream', hex: '#efe9da' }
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

const TITLE = 'Pouch Pet Hoodie';

/** @type {import('./catalog.js').ProductDefinition} */
export const HOODIE = {
	slug: HOODIE_SLUG,
	// After the life jacket, which stays the home page hero and campaign product.
	position: 1,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Keep them close',
			description:
				'A soft pullover hoodie with a roomy front pouch for your cat or small dog to ride in, so they can nap against you while you get on with your day. Wear it around the house, on the sofa or out for a slow stroll, and when they hop out it is simply your favourite hoodie. In Black, Gray, Pink and Cream, sizes XS to XL.'
		}
	},
	options: [
		{ name: 'Color', values: COLOURS },
		{ name: 'Size', values: SIZES.map((size) => ({ code: size, label: size })) }
	],
	// One photo per colour, named by its code — the same convention as the life
	// jacket, so the picker and the dock can show the colour being bought.
	media: COLOURS.map((c) => ({
		url: `/products/${HOODIE_SLUG}/${c.code}.jpg`,
		alt: `${TITLE} in ${c.label}`,
		option: c.code
	})),
	variants: COLOURS.flatMap((c) =>
		SIZES.map((size) => ({
			sku: `CMP-PH-${c.code.toUpperCase()}-${size}`,
			priceCents: PRICE_CENTS,
			compareAtCents: null,
			stock: STOCK,
			options: [c.code, size]
		}))
	)
};
