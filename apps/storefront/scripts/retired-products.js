/**
 * Products taken off sale for good, and where their links go now.
 *
 * Deleting a product's script only stops a fresh database from getting it:
 * `products.js` never removes a row, so the live store would keep selling it
 * to anyone holding the link or a cart saved on an earlier visit. A product
 * listed here is archived instead, by the Worker's catalogue sync
 * (`src/lib/server/catalogue.ts`) and by `npm run db:products`: its row's
 * status moves from `active` to `archived`, which the catalogue reads as gone
 * everywhere, cart and checkout included. The row, its variants and every
 * order that names them stay, so order history and refunds still work.
 *
 * `movedTo` is the product page `/products/<slug>` and its checkout redirect
 * to (`$lib/store/pages.ts`), query string kept, so an old ad, bookmark or
 * landing page link still reaches something on sale.
 *
 * Keep entries after they have run: a database restored from before the
 * retirement still needs them.
 *
 * Imported by the Worker, so nothing here may touch `process`, the
 * filesystem or the network.
 */
export const RETIRED_PRODUCTS = [
	{
		// The Christmas Pouch Hoodie, a person's garment with a pocket for a
		// small pet. Its ads were paused on 2026-10-12; taken down on the owner's
		// call of 2026-10-18, with both of its landing pages, so the costume is
		// the only Christmas product an ad can lead to.
		slug: 'christmas-pouch-hoodie',
		movedTo: 'christmas-tree-costume',
		date: '2026-10-18'
	}
];
