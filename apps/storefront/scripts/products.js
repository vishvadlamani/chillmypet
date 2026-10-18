/**
 * The products every deployment of the store must have.
 *
 * One list, two readers: `add-products.js` for a run by hand, and the Worker
 * itself (`src/lib/server/catalogue.ts`), which adds whatever is missing on its
 * first request after a deploy. A product listed here and absent from the live
 * database is a page that 404s, so a new product goes on this list in the same
 * change as its page manifest in `src/lib/store/pages.ts`.
 *
 * Additive only: a product already in the store is left exactly as it is.
 * `db:seed` is the destructive path, and it refuses to run once orders exist.
 *
 * The life jacket is not here: it has sold since the first seed and its copy
 * is published through `db:content`, not re-added.
 *
 * Taking a product off sale is not deleting it from this list, which leaves
 * the live row selling: list it in `retired-products.js` too.
 *
 * Imported by the Worker, so nothing in this file (or what it imports) may
 * touch `process`, the filesystem or the network.
 */
import { DOG_CHRISTMAS_COSTUME } from './dog-christmas-costume.js';
import { REINDEER_DOG_HOODIE } from './reindeer-dog-hoodie.js';

/** The store these products belong to. The seed's default; one tenant today. */
export const STORE_ID = 'chillmypet';

export const PRODUCTS = [DOG_CHRISTMAS_COSTUME, REINDEER_DOG_HOODIE];
