/**
 * The Christmas Pouch Hoodie: the owner wears it, and a cat or small dog rides
 * in the front pouch and peeks out through the ring in the print.
 *
 * Two designs, each with its own photo:
 *   - Santa Red: Santa hauling a sack, the pet's face framed in the snow cloud
 *   - Stocking Green: a cat-ear ring over a Christmas stocking
 *
 * Sizes are the WEARER'S, S–XL. No size chart is seeded: the store has no
 * manufacturer measurements for this garment yet, and AGENTS.md is explicit
 * that a chart is the supplier's table or nothing. Add a `specs.size_chart`
 * metafield (rows of `{ size, chestCm, lengthCm }`) and the page's size guide
 * renders it as a table instead of the "ask us" note.
 *
 * There is no compare-at price on purpose. A struck-through "was" price has to
 * be one the product was actually offered at, and this one launches at $54.99.
 *
 * English only. Other locales fall back to this row (`catalog.translation()`
 * tries the store default next), so a Spanish visitor reads English rather
 * than a blank title.
 */

export const CHRISTMAS_HOODIE_SLUG = 'christmas-pouch-hoodie';

const PRICE_CENTS = 5499;

/**
 * Per-variant units. Stock is kept outside this system, so this is a ceiling
 * `orders.create()` decrements against, not a count of anything real. Raise
 * it when the supplier says more is available.
 */
const STOCK = 50;

// Code first, because the code is what reaches the order row, the SKU and the
// language packs (`product.colors.<code>`); renaming a label is then safe.
const DESIGNS = [
	{ code: 'red_santa', label: 'Santa Red', hex: '#9e1b24', sku: 'SANTA-RED' },
	{ code: 'green_stocking', label: 'Stocking Green', hex: '#1f4d3a', sku: 'STOCKING-GREEN' }
];

// Add '2XL' here (and a stock row at the supplier) to offer it; the page reads
// sizes from the catalogue, not from its own list.
const SIZES = ['S', 'M', 'L', 'XL'];

const TITLE = 'Christmas Pouch Hoodie';

/** @type {import('./catalog.js').ProductDefinition} */
export const CHRISTMAS_HOODIE = {
	slug: CHRISTMAS_HOODIE_SLUG,
	// After the life jacket, which stays the home page hero and campaign product.
	position: 1,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Your pet, front and centre this Christmas',
			description:
				'A cosy fleece hoodie with a zip-up front pouch and a peek-out ring, so your cat or small dog can ride along and watch the tree with you. Two festive designs, Santa Red and Stocking Green, in adult sizes S to XL.'
		}
	},
	// Positional, and the order matters: the cart, /api/cart and the checkout
	// summary read options[0] as the "colour" slot and options[1] as the size.
	// Design fills that first slot here, so nothing downstream needs to change.
	options: [
		{ name: 'Design', values: DESIGNS.map(({ code, label, hex }) => ({ code, label, hex })) },
		{ name: 'Size', values: SIZES.map((size) => ({ code: size, label: size })) }
	],
	media: DESIGNS.map((d) => ({
		url: `/products/${CHRISTMAS_HOODIE_SLUG}/${d.code}.jpg`,
		alt: `${TITLE} in ${d.label}, worn with a cat peeking out of the pouch`,
		option: d.code
	})),
	// SKUs spell out design and size, because they are the content ids Meta and
	// GA4 receive: `CMP-XH-SANTA-RED-M` reads as what was bought without a lookup.
	variants: DESIGNS.flatMap((d) =>
		SIZES.map((size) => ({
			sku: `CMP-XH-${d.sku}-${size}`,
			priceCents: PRICE_CENTS,
			compareAtCents: null,
			stock: STOCK,
			options: [d.code, size]
		}))
	)
};
