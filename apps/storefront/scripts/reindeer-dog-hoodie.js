/**
 * The Reindeer Christmas Dog Hoodie: a red plush hoodie with brown antlers on
 * the hood, white sherpa trim, snap buttons down the front and a Christmas
 * tree patch on the back. For small dogs. Red only, S–XL.
 *
 * Photos are the supplier's product shots, supplied by the owner in chat for
 * this listing on 2026-10-17 (AGENTS.md, provenance). `worn-red.jpg` is first:
 * the first media row is the listing image the header, the /christmas page
 * and the home page pick up.
 *
 * ⚠️ THE PRICE IS A PLACEHOLDER. $27.99 is the reference store's figure
 * (littletreepups.com), not a decision anyone here has made. There is no
 * compare-at price on purpose: a struck-through "was" price has to be one the
 * product was actually offered at, and this one has never been offered at all.
 *
 * ⚠️ THERE IS NO SIZE CHART YET. The reference store sells S–L with its own
 * chest, neck and back figures; this listing is S–XL and the supplier's table
 * is not in hand. Never type in another seller's numbers: a chart that is
 * wrong is paid for twice, once in postage each way. Until the supplier's
 * rows land in `SIZES`, the size guide says how to measure and that the
 * figures are on the way (its `pending` note), and the page invites an email.
 *
 * English only, like the costume. Other locales fall back to this row
 * (`catalog.translation()` tries the store default next).
 */

export const REINDEER_DOG_HOODIE_SLUG = 'reindeer-dog-hoodie';

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
		photo: 'worn-red.jpg',
		alt: 'A grey poodle in the red reindeer hoodie, hood up with brown antlers, by a Christmas tree'
	}
];

// No measurements yet: see the file comment. A row gains `chestCm`/`lengthCm`
// (or weight bands) when the supplier's table arrives.
const SIZES = [{ code: 'S' }, { code: 'M' }, { code: 'L' }, { code: 'XL' }];

const TITLE = 'Reindeer Christmas Dog Hoodie';

/** @type {import('./catalog.js').ProductDefinition} */
export const REINDEER_DOG_HOODIE = {
	slug: REINDEER_DOG_HOODIE_SLUG,
	// After the costume.
	position: 3,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Santa’s smallest reindeer',
			description:
				'A soft red plush hoodie that turns your dog into one of Santa’s reindeer. Brown antlers on the hood, fluffy white trim, white snap buttons down the front and a Christmas tree patch on the back. For small dogs, sizes S to XL.'
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
			url: `/products/${REINDEER_DOG_HOODIE_SLUG}/${c.photo}`,
			alt: c.alt,
			option: c.code
		})),
		{
			url: `/products/${REINDEER_DOG_HOODIE_SLUG}/back.jpg`,
			alt: 'The reindeer hoodie from behind: antlers on the hood and the Christmas tree patch on the back'
		}
	],
	// SKUs spell out colour and size, because they are the content ids Meta and
	// GA4 receive. RH for "reindeer hoodie", beside the costume's XT and the
	// pouch hoodie's XH.
	variants: COLOURS.flatMap((c) =>
		SIZES.map(({ code }) => ({
			sku: `CMP-RH-${c.sku}-${code}`,
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
