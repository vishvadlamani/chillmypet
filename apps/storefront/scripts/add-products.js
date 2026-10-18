/**
 * Adds products a live store doesn't have yet, and touches nothing else.
 *
 * `db:seed` deletes and recreates the catalogue, so it refuses to run once an
 * order exists. This is the additive path: a product already in the store is
 * skipped, never rewritten, so prices, stock and order history survive.
 *
 *   npm run db:products            # local
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:products
 *
 * It first renames what `slug-changes.js` lists, then applies
 * `price-changes.js` and `copy-changes.js`, each guarded by the old value, and
 * archives what `retired-products.js` lists.
 *
 * Idempotent: running it twice adds nothing the second time. A product also
 * needs a page manifest in `src/lib/store/pages.ts` before its URL serves.
 */
import { createDb } from 'ecomwithai';
import { applyCopyChange, applyPriceChange, archiveProduct, insertProduct, productExists, renameProduct } from './catalog.js';
import { COPY_CHANGES } from './copy-changes.js';
import { PRICE_CHANGES } from './price-changes.js';
import { PRODUCTS } from './products.js';
import { RETIRED_PRODUCTS } from './retired-products.js';
import { SLUG_CHANGES } from './slug-changes.js';
import { STORE } from './content.js';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

const store = await db.execute({ sql: 'select 1 from stores where id = ?', args: [STORE.id] });
if (store.rows.length === 0) {
	console.error(`No store "${STORE.id}" in ${url}. Run db:seed first.`);
	process.exit(1);
}

// Before the adds, as the Worker does: a renamed product keeps its row.
for (const change of SLUG_CHANGES) {
	if ((await renameProduct(db, STORE.id, change)) > 0) console.log(`${change.from}: now ${change.to}`);
}

for (const def of PRODUCTS) {
	if (await productExists(db, STORE.id, def.slug)) {
		console.log(`${def.slug}: already in "${STORE.id}", left as is`);
		continue;
	}
	const { variants } = await insertProduct(db, STORE.id, def);
	console.log(`${def.slug}: added to "${STORE.id}" with ${variants} variants`);
}

// The same guarded price changes the Worker applies on its own.
for (const change of PRICE_CHANGES) {
	const moved = await applyPriceChange(db, STORE.id, change);
	if (moved > 0) console.log(`${change.slug}: ${moved} variants ${change.fromCents} -> ${change.toCents} cents`);
}

for (const change of COPY_CHANGES) {
	if ((await applyCopyChange(db, STORE.id, change)) > 0) {
		console.log(`${change.slug}: ${change.locale} ${change.field} updated`);
	}
}

for (const { slug } of RETIRED_PRODUCTS) {
	if ((await archiveProduct(db, STORE.id, slug)) > 0) console.log(`${slug}: archived, off sale`);
}

db.close();
