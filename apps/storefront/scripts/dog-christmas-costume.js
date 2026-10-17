/**
 * The Pet Christmas Tree Costume: a hooded fleece cape with three ruffled
 * tiers, pom-pom "baubles" and a glitter star on the hood, for small dogs and
 * cats. Red or green, sized by the PET'S weight, S–L.
 *
 * Photos are the supplier's product shots, supplied by the owner in chat for
 * this listing (AGENTS.md, provenance). `worn-red.jpg` is first: the first
 * media row is the listing image the header and the home page pick up, and it
 * is the red colour's gallery photo, which is where the page opens.
 *
 * The price is $27.99, the reindeer hoodie's, on the owner's instruction of
 * 2026-10-17 (one price for the Christmas dog outfits; it was $28.50, the
 * first reference store's figure). There is no compare-at price on purpose: a
 * struck-through "was" price has to be one the product was actually offered
 * at, and this one has never been offered at all.
 *
 * Sizing is by weight, as the supplier lists it. Neck and back-length figures
 * are deliberately absent until the supplier's measured table is in hand; the
 * size guide renders them the moment a row carries `neckCm` or `backLengthCm`.
 * Never type in another seller's numbers: a chart that is wrong is paid for
 * twice, once in postage each way.
 *
 * English only, like the hoodie. Other locales fall back to this row
 * (`catalog.translation()` tries the store default next).
 */

export const DOG_CHRISTMAS_COSTUME_SLUG = 'dog-christmas-costume';

// Kept in step with `price-changes.js`, which moves a live store here.
const PRICE_CENTS = 2799;

/**
 * Per-variant units. Stock is kept outside this system, so this is a ceiling
 * `orders.create()` decrements against, not a count of anything real.
 */
const STOCK = 50;

// Code first, because the code is what reaches the order row, the SKU and the
// language packs (`product.colors.<code>`, which already has both of these).
const COLOURS = [
	{
		code: 'red',
		label: 'Red',
		hex: '#d1232a',
		sku: 'RED',
		photo: 'worn-red.jpg',
		alt: 'A small white dog wearing the red Christmas tree costume, hood up, gold star on top'
	},
	{
		code: 'green',
		label: 'Green',
		hex: '#1f8a43',
		sku: 'GREEN',
		photo: 'green.jpg',
		alt: 'The green Christmas tree costume laid flat: hood, tie cord, pom-poms and the glitter star'
	}
];

// The pet's weight, in kilograms, as the supplier sizes it.
const SIZES = [
	{ code: 'S', weightKg: [1.5, 2.5] },
	{ code: 'M', weightKg: [2.5, 5] },
	{ code: 'L', weightKg: [5, 7.5] }
];

// "Pet", not "Dog", since 2026-10-17 (owner's call): it fits small dogs and
// cats, and the page opens on a cat. The slug stays, so links and ads keep
// working; a live store is renamed through `copy-changes.js`.
const TITLE = 'Pet Christmas Tree Costume';

/** @type {import('./catalog.js').ProductDefinition} */
export const DOG_CHRISTMAS_COSTUME = {
	slug: DOG_CHRISTMAS_COSTUME_SLUG,
	// After the life jacket (home hero) and the hoodie.
	position: 2,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'The cutest tree in the house',
			description:
				'A soft hooded cape that turns your dog or cat into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.'
		}
	},
	// Positional, and the order matters: the cart, /api/cart and the checkout
	// summary read options[0] as the colour slot and options[1] as the size.
	options: [
		{ name: 'Colour', values: COLOURS.map(({ code, label, hex }) => ({ code, label, hex })) },
		{ name: 'Size', values: SIZES.map(({ code }) => ({ code, label: code })) }
	],
	media: [
		// One per colour, tied to its swatch: what the gallery shows for it.
		...COLOURS.map((c) => ({
			url: `/products/${DOG_CHRISTMAS_COSTUME_SLUG}/${c.photo}`,
			alt: c.alt,
			option: c.code
		})),
		// The rest show the product as a whole; the page's "closer look" grid.
		{
			url: `/products/${DOG_CHRISTMAS_COSTUME_SLUG}/red.jpg`,
			alt: 'The red Christmas tree costume laid flat'
		},
		{
			url: `/products/${DOG_CHRISTMAS_COSTUME_SLUG}/green-back.jpg`,
			alt: 'The green costume from behind: three ruffled tiers shaped like a tree, star on top'
		},
		{
			url: `/products/${DOG_CHRISTMAS_COSTUME_SLUG}/hood-detail.jpg`,
			alt: 'Close-up of the hood opening, the tie cord and the button'
		}
	],
	// SKUs spell out colour and size, because they are the content ids Meta and
	// GA4 receive: `CMP-XT-GREEN-M` reads as what was bought without a lookup.
	// XT for "Xmas tree", beside the hoodie's XH.
	variants: COLOURS.flatMap((c) =>
		SIZES.map(({ code }) => ({
			sku: `CMP-XT-${c.sku}-${code}`,
			priceCents: PRICE_CENTS,
			compareAtCents: null,
			stock: STOCK,
			options: [c.code, code]
		}))
	),
	// The size guide reads this. Weight only, see the file comment.
	metafields: [
		{
			namespace: 'specs',
			key: 'size_chart',
			locale: null,
			value: SIZES.map(({ code, weightKg }) => ({
				size: code,
				weightMinKg: weightKg[0],
				weightMaxKg: weightKg[1]
			}))
		}
	]
};
