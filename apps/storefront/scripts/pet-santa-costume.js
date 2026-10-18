/**
 * The Pet Santa Costume with Gift: a red plush Santa suit with white fur trim,
 * a black belt and a pair of plush arms that hold a wrapped present out front,
 * so the pet looks like it is delivering it, plus a matching Santa hat. A cord
 * toggle at the neck takes up the slack. For small pets. Red only, S–L. The
 * owner's working name for it was "Christmas Pet Costume_2"; it was the
 * "Santa Pet Costume with Gift" at `santa-pet-costume` on its first day.
 *
 * Photos are the supplier's lifestyle shots (a French bulldog and a ginger
 * cat), supplied by the owner in chat for this listing on 2026-10-18
 * (AGENTS.md, provenance). `dog.jpg` is first: the first media row is the
 * listing image the header, the /christmas page, the sticky bar and og:image
 * pick up.
 *
 * $27.99, the owner's decision on 2026-10-18 (the reindeer hoodie's price).
 * Changing it later goes through `price-changes.js`: `products.js` never
 * rewrites a row. There is no compare-at price on purpose: a struck-through "was" price
 * has to be one the product was actually offered at, and this one has never
 * been offered at all.
 *
 * ⚠️ THERE IS NO SIZE CHART YET. Never type in another seller's numbers: a
 * chart that is wrong is paid for twice, once in postage each way. Until the
 * supplier's rows land in `SIZES`, the size guide says how to measure and that
 * the figures are on the way (its `pending` note), and the page invites an
 * email.
 *
 * English only, like the costume. Other locales fall back to this row
 * (`catalog.translation()` tries the store default next).
 */

export const PET_SANTA_COSTUME_SLUG = 'pet-santa-costume';

// The photos stay in the folder named for the slug they were added under: the
// live store's media rows point at these paths (`slug-changes.js`).
const PHOTOS = '/products/santa-pet-costume';

const PRICE_CENTS = 2799;

/**
 * Per-variant units. Stock is kept outside this system, so this is a ceiling
 * `orders.create()` decrements against, not a count of anything real.
 */
const STOCK = 50;

// One colour, still an option: the cart, /api/cart and the checkout summary
// read options[0] as the colour slot, and `red` is already named in both
// language packs (`product.colors.red`).
const COLOURS = [
	{
		code: 'red',
		label: 'Red',
		hex: '#d1232a',
		sku: 'RED',
		photo: 'dog.jpg',
		alt: 'A French bulldog in the red Santa costume and hat, its plush arms holding a green wrapped present'
	}
];

// No measurements yet: see the file comment. A row gains `chestCm`/`lengthCm`
// (or weight bands) when the supplier's table arrives.
const SIZES = [{ code: 'S' }, { code: 'M' }, { code: 'L' }];

const TITLE = 'Pet Santa Costume with Gift';

/** @type {import('./catalog.js').ProductDefinition} */
export const PET_SANTA_COSTUME = {
	slug: PET_SANTA_COSTUME_SLUG,
	// After the reindeer hoodie.
	position: 4,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Your pet, delivering the presents',
			description:
				'A soft red plush Santa suit with white fur trim and a black belt, and two little plush arms out front holding a wrapped present, so your pet looks like Santa making a delivery. Comes with a matching Santa hat. For small pets, sizes S to L.'
		}
	},
	// Positional, and the order matters: the cart, /api/cart and the checkout
	// summary read options[0] as the colour slot and options[1] as the size.
	options: [
		{ name: 'Colour', values: COLOURS.map(({ code, label, hex }) => ({ code, label, hex })) },
		{ name: 'Size', values: SIZES.map(({ code }) => ({ code, label: code })) }
	],
	media: [
		...COLOURS.map((c) => ({
			url: `${PHOTOS}/${c.photo}`,
			alt: c.alt,
			option: c.code
		})),
		{
			url: `${PHOTOS}/cat.jpg`,
			alt: 'A ginger cat in the same Santa costume and hat, holding the present'
		}
	],
	// SKUs spell out colour and size, because they are the content ids Meta and
	// GA4 receive. SP for "Santa pet costume", beside the costume's XT
	// and the reindeer hoodie's RH.
	variants: COLOURS.flatMap((c) =>
		SIZES.map(({ code }) => ({
			sku: `CMP-SP-${c.sku}-${code}`,
			priceCents: PRICE_CENTS,
			compareAtCents: null,
			stock: STOCK,
			options: [c.code, code]
		}))
	),
	// Deliberately empty until the supplier's figures are in; see above. An
	// empty chart is what makes the size guide show its pending note.
	metafields: []
};
