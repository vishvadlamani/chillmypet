/**
 * The Worker brings its own database up to date.
 *
 * A product page is code AND a row: the manifest ships with the Worker, but
 * the page is a 404 until the product is in the live database. The deploy
 * workflow used to run `db:migrate` and `db:products` first, which needs the
 * database's token as a repository secret. The repository's owner does not
 * hold that token (the Turso account is someone else's), so the step never
 * ran, and /products/christmas-pouch-hoodie was a 404 on chillmypet.com for
 * days after the page had deployed. The Worker already holds the token: it
 * serves every page from that database. So it does the job itself, once per
 * isolate, on the first request after a deploy, in the background.
 *
 * Both halves are additive and idempotent. The schema is `create ... if not
 * exists` throughout, and a product the store already has is skipped, never
 * rewritten, so prices, stock and order history survive. Two isolates racing
 * to add the same product is harmless: `unique (store_id, slug)` fails the
 * loser's transaction, which rolls back, and the row is there on re-check.
 *
 * Nothing here can fail a request. The sync is handed to `waitUntil`, errors
 * go to console.error, and a failed attempt waits a minute before the next
 * request retries it, rather than every request retrying.
 */
import { SCHEMA, applySchema, schemaStatements, type Client } from 'ecomwithai/db';
import { insertProduct, productExists } from '../../../scripts/catalog.js';
import { PRODUCTS, STORE_ID } from '../../../scripts/products.js';

/**
 * Every table and index the schema creates, by name. One read of
 * `sqlite_master` then says whether the schema is behind the code, which is
 * what makes this cheap enough to run on every cold start: the full
 * `applySchema` is dozens of round trips and only runs when something is
 * missing. `catalogue.test.ts` pins that every statement in the schema is
 * recognised here, so a new kind of statement cannot slip past the check.
 */
export const SCHEMA_OBJECTS: string[] = schemaStatements(SCHEMA)
	.map((statement) => /^create\s+(?:unique\s+)?(?:table|index)\s+if\s+not\s+exists\s+(\w+)/i.exec(statement)?.[1])
	.filter((name): name is string => typeof name === 'string');

async function missingSchemaObjects(db: Client): Promise<string[]> {
	const result = await db.execute("select name from sqlite_master where type in ('table', 'index')");
	const present = new Set(result.rows.map((row) => String(row.name)));
	return SCHEMA_OBJECTS.filter((name) => !present.has(name));
}

export type CatalogueSync = {
	/** Tables and indexes that were missing and have now been created. */
	schemaCreated: string[];
	/** Products added to the store on this run. */
	added: string[];
	/** Products the store already had, left as they were. */
	skipped: string[];
	/** The store row itself is absent: nothing to add products to. Seed first. */
	storeMissing: boolean;
};

/**
 * Creates whatever the schema has that the database lacks, then adds whatever
 * `PRODUCTS` has that the store lacks. Safe to run any number of times.
 */
export async function syncCatalogue(db: Client, storeId: string = STORE_ID): Promise<CatalogueSync> {
	const schemaCreated = await missingSchemaObjects(db);
	if (schemaCreated.length > 0) await applySchema(db);

	const store = await db.execute({ sql: 'select 1 from stores where id = ?', args: [storeId] });
	const slugs = PRODUCTS.map((def) => def.slug);
	if (store.rows.length === 0) {
		return { schemaCreated, added: [], skipped: slugs, storeMissing: true };
	}

	const added: string[] = [];
	const skipped: string[] = [];
	for (const def of PRODUCTS) {
		if (await productExists(db, storeId, def.slug)) {
			skipped.push(def.slug);
			continue;
		}
		try {
			await insertProduct(db, storeId, def);
			added.push(def.slug);
		} catch (error) {
			// Another isolate got there first: its row is what the unique
			// constraint just defended. Anything else is a real failure.
			if (await productExists(db, storeId, def.slug)) skipped.push(def.slug);
			else throw error;
		}
	}
	return { schemaCreated, added, skipped, storeMissing: false };
}

const RETRY_AFTER_MS = 60_000;

let synced = false;
let pending: Promise<void> | undefined;
let retryAt = 0;

/**
 * Runs the sync once per isolate, off the request's path. Hand it the
 * platform context so the Worker is kept alive until it finishes; without one
 * (dev, tests) it simply runs in the background.
 */
export function ensureCatalogue(
	db: Client,
	context?: { waitUntil(promise: Promise<unknown>): void }
): void {
	if (synced || pending || Date.now() < retryAt) return;

	pending = syncCatalogue(db)
		.then((result) => {
			if (result.storeMissing) {
				retryAt = Date.now() + RETRY_AFTER_MS;
				console.error(`catalogue sync: no store "${STORE_ID}" in the database; run the seed`);
				return;
			}
			synced = true;
			if (result.schemaCreated.length > 0 || result.added.length > 0) {
				console.log('catalogue sync', JSON.stringify(result));
			}
		})
		.catch((error) => {
			retryAt = Date.now() + RETRY_AFTER_MS;
			console.error('catalogue sync failed, retrying after a minute', error);
		})
		.finally(() => {
			pending = undefined;
		});

	// Called as a method: destructuring waitUntil loses `this` and throws.
	if (context && typeof context.waitUntil === 'function') context.waitUntil(pending);
}

/** Test seam: forget that this isolate has synced. */
export function resetCatalogueSync(): void {
	synced = false;
	pending = undefined;
	retryAt = 0;
}
