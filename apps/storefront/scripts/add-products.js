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
 * Idempotent: running it twice adds nothing the second time. A product also
 * needs a page manifest in `src/lib/store/pages.ts` before its URL serves.
 */
import { createDb } from 'ecomwithai';
import { insertProduct, productExists } from './catalog.js';
import { STORE } from './content.js';
import { HOODIE } from './hoodie.js';

const PRODUCTS = [HOODIE];

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

const store = await db.execute({ sql: 'select 1 from stores where id = ?', args: [STORE.id] });
if (store.rows.length === 0) {
	console.error(`No store "${STORE.id}" in ${url}. Run db:seed first.`);
	process.exit(1);
}

for (const def of PRODUCTS) {
	if (await productExists(db, STORE.id, def.slug)) {
		console.log(`${def.slug}: already in "${STORE.id}", left as is`);
		continue;
	}
	const { variants } = await insertProduct(db, STORE.id, def);
	console.log(`${def.slug}: added to "${STORE.id}" with ${variants} variants`);
}

db.close();
