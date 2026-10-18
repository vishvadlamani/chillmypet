/**
 * Products whose URL changed: the slug they had and the one they have now.
 *
 * `products.js` adds what the store lacks by slug, so renaming a product in
 * its script alone would add a second, empty copy beside the one selling. A
 * change listed here is applied first, by the Worker's catalogue sync and by
 * `npm run db:products`: the existing row takes the new slug, keeping its
 * stock, SKUs, photos and order history, and only then does the add see it
 * already there. Only a row still at `from` moves, and never onto a slug in
 * use, so a run is a no-op once it has applied.
 *
 * The old URL keeps working: `/products/<from>` and its checkout redirect to
 * the product's current URL (`$lib/store/pages.ts`) in one hop, however many
 * renames later, query string and all, since it is the same product with the
 * same sizes. A live ad's link lands where it did.
 *
 * Photo paths (`/products/<old slug>/…`) are left as they are: they are
 * files, the live media rows point at them, and nobody reads them.
 *
 * Keep entries after they have run: a database restored from before the
 * rename still needs them. Imported by the Worker: no `process`, filesystem
 * or network.
 */
export const SLUG_CHANGES = [
	// "Pet", never "dog" or "cat", in a product's name and URL (the owner's
	// call, 2026-10-18).
	{ from: 'dog-christmas-costume', to: 'pet-christmas-costume', date: '2026-10-18' },
	{ from: 'reindeer-dog-hoodie', to: 'christmas-pet-hoodie', date: '2026-10-18' },
	{ from: 'santa-pet-costume', to: 'pet-santa-costume', date: '2026-10-18' },
	// Then no "pet", "dog" or "cat" at all, in a name, a URL or anything a
	// shopper reads (the owner's call, the same evening). In order: a store
	// still at a first slug moves through each rename in turn.
	{ from: 'pet-christmas-costume', to: 'christmas-tree-costume', date: '2026-10-18' },
	{ from: 'christmas-pet-hoodie', to: 'christmas-hoodie', date: '2026-10-18' },
	{ from: 'pet-santa-costume', to: 'santa-costume-with-gift', date: '2026-10-18' },
	{ from: 'dog-life-jacket', to: 'life-jacket', date: '2026-10-18' }
];
