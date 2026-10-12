/**
 * The Worker's own catalogue sync: it must create what the schema has and the
 * database lacks, add a product exactly once, and leave a store it has already
 * synced untouched. Runs against an in-memory SQLite, so nothing here touches
 * a real database.
 *
 *   npm test
 */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCHEMA, applySchema, createDb, schemaStatements } from 'ecomwithai/db';
import { PRODUCTS, STORE_ID } from '../../../scripts/products.js';
import { SCHEMA_OBJECTS, ensureCatalogue, resetCatalogueSync, syncCatalogue } from './catalogue.ts';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
	if (!ok) {
		console.log(`      expected ${JSON.stringify(expected)}`);
		console.log(`      actual   ${JSON.stringify(actual)}`);
		failures += 1;
	}
}

const HOODIE = 'christmas-pouch-hoodie';
const COSTUME = 'dog-christmas-costume';
/** Every product the list carries, in order: what one sync adds and the next one skips. */
const LISTED = [HOODIE, COSTUME];
const VARIANTS = PRODUCTS.reduce((n, p) => n + p.variants.length, 0);

// A file, not `:memory:`: the libSQL client reopens its connection around a
// transaction, and an in-memory database does not survive that.
let databases = 0;
function openDb() {
	const path = join(tmpdir(), `chillmypet-catalogue-${process.pid}-${(databases += 1)}.db`);
	const db = createDb({ url: `file:${path}` });
	const close = () => {
		db.close();
		for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
	};
	return { db, close };
}

async function count(db: ReturnType<typeof createDb>, sql: string): Promise<number> {
	const result = await db.execute(sql);
	return Number(result.rows[0].n);
}

async function addStore(db: ReturnType<typeof createDb>) {
	await db.execute({
		sql: "insert into stores (id, domain, name) values (?, 'chillmypet.test', 'ChillMyPet')",
		args: [STORE_ID]
	});
}

// --- the schema check sees every statement ---------------------------------
check(
	'every schema statement is a table or index the sync can check for',
	SCHEMA_OBJECTS.length,
	schemaStatements(SCHEMA).length
);
check(
	'the hoodie and the costume are the products every deployment must have',
	PRODUCTS.map((p) => p.slug),
	LISTED
);

// --- a store without the product gets it, once -----------------------------
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);

	const first = await syncCatalogue(db);
	check('first sync adds every listed product', first, {
		schemaCreated: [],
		added: LISTED,
		skipped: [],
		storeMissing: false
	});
	check('one row per product', await count(db, 'select count(*) as n from products'), LISTED.length);
	check(
		'all their variants',
		await count(db, 'select count(*) as n from product_variants'),
		VARIANTS
	);

	const second = await syncCatalogue(db);
	check('second sync adds nothing', second, {
		schemaCreated: [],
		added: [],
		skipped: LISTED,
		storeMissing: false
	});
	check('still one row per product', await count(db, 'select count(*) as n from products'), LISTED.length);
	close();
}

// --- a database behind the schema is brought up to it -----------------------
{
	const { db, close } = openDb();
	for (const statement of schemaStatements(SCHEMA)) {
		if (!/fulfillments/.test(statement)) await db.execute(statement);
	}
	await addStore(db);

	const result = await syncCatalogue(db);
	check('the missing table and its index are created', result.schemaCreated, [
		'fulfillments',
		'idx_fulfillments_store'
	]);
	check('and the products are still added in the same run', result.added, LISTED);
	check(
		'fulfillments exists afterwards',
		await count(db, "select count(*) as n from sqlite_master where name = 'fulfillments'"),
		1
	);
	close();
}

// --- no store, no products ---------------------------------------------------
{
	const { db, close } = openDb();
	await applySchema(db);
	const result = await syncCatalogue(db);
	check('a database with no store row gets no products', result, {
		schemaCreated: [],
		added: [],
		skipped: LISTED,
		storeMissing: true
	});
	check('nothing was written', await count(db, 'select count(*) as n from products'), 0);
	close();
}

// --- ensureCatalogue runs once per isolate and hands the work to waitUntil --
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	resetCatalogueSync();

	const kept: Promise<unknown>[] = [];
	const context = { waitUntil: (p: Promise<unknown>) => void kept.push(p) };
	ensureCatalogue(db, context);
	ensureCatalogue(db, context);
	check('one sync is handed to waitUntil, not one per request', kept.length, 1);
	await Promise.all(kept);
	check('the products are there afterwards', await count(db, 'select count(*) as n from products'), LISTED.length);
	ensureCatalogue(db, context);
	check('a synced isolate does not sync again', kept.length, 1);
	close();
	resetCatalogueSync();
}

if (failures > 0) {
	console.log(`\n${failures} check(s) failed`);
	process.exit(1);
}
console.log('\nall checks passed');
