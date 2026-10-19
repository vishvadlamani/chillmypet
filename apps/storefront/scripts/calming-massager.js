/**
 * The Calming Massager: a round, fabric-covered massager that sits on the
 * back on an adjustable strap, with soft silicone hands that knead. Two
 * buttons on top. Khaki or black, one size.
 *
 * Photos were supplied by the owner in chat for this listing on 2026-10-19
 * (AGENTS.md, provenance): a golden retriever wearing the khaki one, which is
 * `khaki.jpg` and the listing image; `black.jpg`, the supplier's composite
 * of the black one with its strap, box, manual and cable and a golden
 * retriever wearing it, padded with white to the gallery's frame (sent the
 * same day, after a blurry close-up came off the page); and
 * `on-the-back.jpg`, a Labrador wearing the khaki one, cropped
 * clear of the supplier's "PET MASSAGER" lettering. They look AI-generated
 * and their source and licence were not stated: ask before an ad uses them.
 *
 * The owner calls it the pet massager. "Pet" can't be in a name a shopper
 * reads (the owner's rule, AGENTS.md), so it is the Calming Massager; a later
 * rename goes through `copy-changes.js` and keeps this slug.
 *
 * One size, so the size slot (options[1]) holds a single value and the picker
 * shows no size buttons: the product pages read it as chosen
 * (`oneSize` in their loads). The colour fills the design slot, as on every
 * other page.
 *
 * $57.99, the owner's price on 2026-10-19. Changing it later goes through
 * `price-changes.js`: `products.js` never rewrites a row. No compare-at price:
 * it has never been offered at any other.
 *
 * Only what the photos show is claimed: the strap, the hands, the two
 * buttons. Nothing about heat, modes, battery or charging until the supplier's
 * spec sheet is in hand.
 *
 * No "pet", "dog" or "cat" in the copy (the owner's rule, AGENTS.md). English
 * only; other locales fall back to this row.
 */

export const CALMING_MASSAGER_SLUG = 'calming-massager';

const PHOTOS = `/products/${CALMING_MASSAGER_SLUG}`;

const PRICE_CENTS = 5799;

/**
 * Per-variant units. Stock is kept outside this system, so this is a ceiling
 * `orders.create()` decrements against, not a count of anything real.
 */
const STOCK = 50;

const COLOURS = [
	{
		code: 'khaki',
		label: 'Khaki',
		hex: '#4f5d3f',
		sku: 'KHAKI',
		photo: 'khaki.jpg',
		alt: 'A golden retriever lying on a sofa wearing the khaki massager on a brown strap across its back'
	},
	{
		code: 'black',
		label: 'Black',
		hex: '#1f1f1f',
		sku: 'BLACK',
		photo: 'black.jpg',
		alt: 'The black massager with its strap, its box and manual, and a golden retriever wearing it'
	}
];

// The code is what the cart, the checkout summary and the order row print
// beside the colour ("Khaki · One size"), so it is the words themselves.
const ONE_SIZE = 'One size';

const TITLE = 'Calming Massager';

/** @type {import('./catalog.js').ProductDefinition} */
export const CALMING_MASSAGER = {
	slug: CALMING_MASSAGER_SLUG,
	// After the Christmas products; the collections list those first anyway.
	position: 6,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Hands-free kneading, worn on a strap',
			description:
				'A soft, hands-free massager for your little one. The round body straps across their back and its four silicone hands knead while they lie down and settle. An adjustable strap holds it in place, and two buttons on top work it. In khaki or black, one size.'
		}
	},
	// Positional, and the order matters: the cart, /api/cart and the checkout
	// summary read options[0] as the colour slot and options[1] as the size.
	options: [
		{ name: 'Colour', values: COLOURS.map(({ code, label, hex }) => ({ code, label, hex })) },
		{ name: 'Size', values: [{ code: ONE_SIZE, label: ONE_SIZE }] }
	],
	// One per colour, tied to its choice: what the gallery shows for it.
	media: COLOURS.map((c) => ({
		url: `${PHOTOS}/${c.photo}`,
		alt: c.alt,
		option: c.code
	})),
	// SKUs name the colour, because they are the content ids Meta and GA4
	// receive. MS for "massager".
	variants: COLOURS.map((c) => ({
		sku: `CMP-MS-${c.sku}`,
		priceCents: PRICE_CENTS,
		compareAtCents: null,
		stock: STOCK,
		options: [c.code, ONE_SIZE]
	})),
	metafields: []
};
