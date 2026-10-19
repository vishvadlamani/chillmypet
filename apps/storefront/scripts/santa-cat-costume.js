/**
 * The Santa Cat Costume: a red Santa outfit for cats, in two styles. The
 * suit has a hat, a fur-trimmed jacket with a black belt and gold buckle, and
 * trousers; the dress has a white plush collar, button front, a ruffled skirt
 * and a black sash with a gold buckle. Red only, S–L.
 *
 * Photos are the supplier's product shots, supplied by the owner in chat for
 * this listing on 2026-10-19 (AGENTS.md, provenance), one per style.
 * `suit.jpg` is first: the first media row is the listing image the header,
 * the /christmas page and the home page pick up.
 *
 * The style fills the design slot (options[0]), the way colour does on the
 * other Christmas pages: the owner asked for one product, red, S/M/L, and the
 * two photos are two different outfits, so the buyer picks which one ships.
 * Its codes are named under `product.colors.<code>` in both language packs,
 * or the checkout prints the key.
 *
 * ⚠️ THE PRICE IS A PLACEHOLDER. $27.99 is the reindeer hoodie's figure, which
 * the owner chose to reuse, not a decision about this product. There is no
 * compare-at price on purpose: a struck-through "was" price has to be one the
 * product was actually offered at, and this one has never been offered at all.
 *
 * ⚠️ THERE IS NO SIZE CHART YET. The supplier's table is not in hand. Never
 * type in another seller's numbers: a chart that is wrong is paid for twice,
 * once in postage each way. Until the supplier's rows land in `SIZES`, the
 * size guide says how to measure and that the figures are on the way (its
 * `pending` note), and the page invites an email.
 *
 * English only, like the costume. Other locales fall back to this row
 * (`catalog.translation()` tries the store default next).
 */

export const SANTA_CAT_COSTUME_SLUG = 'santa-cat-costume';

const PRICE_CENTS = 2799;

/**
 * Per-variant units. Stock is kept outside this system, so this is a ceiling
 * `orders.create()` decrements against, not a count of anything real.
 */
const STOCK = 50;

// Both red: the swatch is the same, the label and the photo tell them apart.
const STYLES = [
	{
		code: 'santa_suit',
		label: 'Santa Suit',
		hex: '#d1232a',
		sku: 'SUIT',
		photo: 'suit.jpg',
		alt: 'A ginger cat standing in the red Santa suit: hat with a pom-pom, fur-trimmed jacket, black belt with a gold buckle, and red trousers'
	},
	{
		code: 'santa_dress',
		label: 'Santa Dress',
		hex: '#d1232a',
		sku: 'DRESS',
		photo: 'dress.jpg',
		alt: 'A tabby cat by a fireplace in the red Santa dress: white plush collar, button front, ruffled skirt and a black sash with a gold buckle'
	}
];

// No measurements yet: see the file comment. A row gains its figures when the
// supplier's table arrives.
const SIZES = [{ code: 'S' }, { code: 'M' }, { code: 'L' }];

const TITLE = 'Santa Cat Costume';

/** @type {import('./catalog.js').ProductDefinition} */
export const SANTA_CAT_COSTUME = {
	slug: SANTA_CAT_COSTUME_SLUG,
	// After the reindeer hoodie.
	position: 4,
	translations: {
		en: {
			title: TITLE,
			subtitle: 'Santa’s helper has whiskers',
			description:
				'A red Santa outfit for your cat, in two styles. The Santa Suit comes with a pom-pom hat, a fur-trimmed jacket with a black belt and gold buckle, and little red trousers. The Santa Dress has a fluffy white collar, white buttons, a ruffled skirt and a black sash with a gold buckle. Sizes S to L.'
		}
	},
	// Positional, and the order matters: the cart, /api/cart and the checkout
	// summary read options[0] as the colour slot and options[1] as the size.
	options: [
		{ name: 'Style', values: STYLES.map(({ code, label, hex }) => ({ code, label, hex })) },
		{ name: 'Size', values: SIZES.map(({ code }) => ({ code, label: code })) }
	],
	// One per style, tied to its choice: what the gallery shows for it.
	media: STYLES.map((s) => ({
		url: `/products/${SANTA_CAT_COSTUME_SLUG}/${s.photo}`,
		alt: s.alt,
		option: s.code
	})),
	// SKUs spell out style and size, because they are the content ids Meta and
	// GA4 receive. SC for "Santa cat", beside the reindeer hoodie's RH.
	variants: STYLES.flatMap((s) =>
		SIZES.map(({ code }) => ({
			sku: `CMP-SC-${s.sku}-${code}`,
			priceCents: PRICE_CENTS,
			compareAtCents: null,
			stock: STOCK,
			options: [s.code, code]
		}))
	),
	// Deliberately empty until the supplier's figures are in; see above. An
	// empty chart is what makes the size guide show its pending note.
	metafields: []
};
