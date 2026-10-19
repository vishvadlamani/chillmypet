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
import { COPY_CHANGES } from '../../../scripts/copy-changes.js';
import { PRICE_CHANGES } from '../../../scripts/price-changes.js';
import { PRODUCTS, STORE_ID } from '../../../scripts/products.js';
import { RETIRED_PRODUCTS } from '../../../scripts/retired-products.js';
import { SLUG_CHANGES } from '../../../scripts/slug-changes.js';
import { insertProduct } from '../../../scripts/catalog.js';
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

const COSTUME = 'christmas-tree-costume';
const REINDEER = 'christmas-hoodie';
const SANTA = 'santa-costume-with-gift';
const OUTFIT = 'santa-outfit';
const RETIRED = 'christmas-pouch-hoodie';
/** Every product the list carries, in order: what one sync adds and the next one skips. */
const LISTED = [COSTUME, REINDEER, SANTA, OUTFIT];
/** The products the 2026-10-18 renames and copy changes reach: the outfit came after. */
const RENAMED = [COSTUME, REINDEER, SANTA];
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
	'the costume, the reindeer hoodie, the Santa costume and the Santa outfit are the products every deployment must have',
	PRODUCTS.map((p) => p.slug),
	LISTED
);
check(
	'the Christmas Pouch Hoodie is retired, to the costume',
	RETIRED_PRODUCTS.map(({ slug, movedTo }) => [slug, movedTo]),
	[[RETIRED, COSTUME]]
);
check(
	'and no longer listed',
	PRODUCTS.some((p) => p.slug === RETIRED),
	false
);

// --- a store without the product gets it, once -----------------------------
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);

	const first = await syncCatalogue(db);
	check('first sync adds every listed product', first, {
		schemaCreated: [],
		renamed: [],
		added: LISTED,
		skipped: [],
		repriced: [],
		recopied: [],
		archived: [],
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
		renamed: [],
		added: [],
		skipped: LISTED,
		repriced: [],
		recopied: [],
		archived: [],
		storeMissing: false
	});
	check('still one row per product', await count(db, 'select count(*) as n from products'), LISTED.length);
	close();
}

// --- a live store still at an old price is moved, once, and only there ------
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	await syncCatalogue(db);

	const change = PRICE_CHANGES.find((c) => c.slug === COSTUME)!;
	const prices = async (slug: string) =>
		(
			await db.execute({
				sql: `select distinct v.price_cents as p from product_variants v
				      join products p on p.id = v.product_id where p.slug = ? order by 1`,
				args: [slug]
			})
		).rows.map((r) => Number(r.p));
	check('a fresh store gets the costume at its new price already', await prices(COSTUME), [change.toCents]);
	check('the reindeer hoodie is at the same price', await prices(REINDEER), [change.toCents]);

	// The live store: added before the change, so still at the old price.
	await db.execute({
		sql: `update product_variants set price_cents = ? where product_id =
		      (select id from products where slug = ?)`,
		args: [change.fromCents, COSTUME]
	});
	// One variant someone priced by hand since: the guard must leave it.
	await db.execute({
		sql: `update product_variants set price_cents = 3100 where id =
		      (select min(v.id) from product_variants v join products p on p.id = v.product_id where p.slug = ?)`,
		args: [COSTUME]
	});
	const first = await syncCatalogue(db);
	check('the sync moves the costume', first.repriced, [COSTUME]);
	check('every variant at the old price, and not the one priced by hand', await prices(COSTUME), [change.toCents, 3100]);
	const second = await syncCatalogue(db);
	check('and a second sync moves nothing', second.repriced, []);
	close();
}

// --- a live store's copy is renamed, once, and only where it still reads the old words
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	await syncCatalogue(db);
	const field = async (name: 'title' | 'description') =>
		String(
			(
				await db.execute({
					sql: `select t.${name} as v from product_translations t
					      join products p on p.id = t.product_id where p.slug = ? and t.locale = 'en'`,
					args: [COSTUME]
				})
			).rows[0].v
		);
	const title = COPY_CHANGES.find((c) => c.slug === COSTUME && c.field === 'title')!;
	check('a fresh store gets the costume under its new name', await field('title'), title.to);
	check('which says no pet, dog or cat', !/\b(pets?|dogs?|cats?)\b/i.test(title.to), true);

	// The live store: added before the rename.
	for (const change of COPY_CHANGES) {
		await db.execute({
			sql: `update product_translations set ${change.field} = ? where locale = ? and product_id =
			      (select id from products where slug = ?)`,
			args: [change.from, change.locale, change.slug]
		});
	}
	const first = await syncCatalogue(db);
	check('the sync recopies the three Christmas products it renamed', first.recopied, RENAMED);
	check('its title', await field('title'), title.to);
	check('and its description, which says no pet, dog or cat', /little one/.test(await field('description')) && !/\b(pets?|dogs?|cats?)\b/i.test(await field('description')), true);
	const second = await syncCatalogue(db);
	check('a second sync changes nothing', second.recopied, []);

	// Copy edited by hand since is left alone.
	await db.execute({
		sql: `update product_translations set title = 'Tree Cape' where product_id = (select id from products where slug = ?)`,
		args: [COSTUME]
	});
	await syncCatalogue(db);
	check('a title edited by hand is not overwritten', await field('title'), 'Tree Cape');
	close();
}

// --- a change can take a "was" price off with it -----------------------------
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	const change = PRICE_CHANGES.find((c) => c.slug === 'life-jacket')!;
	// The life jacket is seeded, not listed, so stand one in at its old row:
	// any listed product's shape, under its slug, at the old price and "was".
	const shape = PRODUCTS[0];
	await insertProduct(db, STORE_ID, {
		...shape,
		slug: change.slug,
		variants: shape.variants.map((v) => ({ ...v, sku: `LJ-${v.sku}`, priceCents: change.fromCents, compareAtCents: 6397 }))
	});
	const result = await syncCatalogue(db);
	check('the life jacket moves to its new price', result.repriced.includes(change.slug), true);
	const rows = await db.execute({
		sql: `select distinct v.price_cents as p, v.compare_at_cents as c from product_variants v
		      join products p on p.id = v.product_id where p.slug = ?`,
		args: [change.slug]
	});
	check('and its struck-through price is gone', rows.rows.map((r) => [Number(r.p), r.c]), [[change.toCents, null]]);
	close();
}

// --- a live store's products under their first slugs are renamed in place, once ---
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	// The slug each product was first added under, walking the renames back.
	const firstSlug = (slug: string) => {
		for (let from = SLUG_CHANGES.find((c) => c.to === slug); from; from = SLUG_CHANGES.find((c) => c.to === slug)) {
			slug = from.from;
		}
		return slug;
	};
	// The live store as it was: every product under its first slug and its
	// first title, as the first deploy added it, and the life jacket too.
	const FIRST_TITLES: Record<string, string> = {
		[COSTUME]: 'Dog Christmas Tree Costume',
		[REINDEER]: 'Reindeer Christmas Dog Hoodie',
		[SANTA]: 'Santa Pet Costume with Gift',
		[OUTFIT]: 'Santa Outfit'
	};
	for (const def of PRODUCTS) {
		await insertProduct(db, STORE_ID, {
			...def,
			slug: firstSlug(def.slug),
			translations: { en: { ...def.translations.en, title: FIRST_TITLES[def.slug] } }
		});
	}
	const shape = PRODUCTS[0];
	await insertProduct(db, STORE_ID, {
		...shape,
		slug: 'dog-life-jacket',
		translations: { en: { title: 'Dog Life Jacket' } },
		variants: shape.variants.map((v) => ({ ...v, sku: `DLJ-${v.sku}` }))
	});
	check('the first slugs are the old dog and pet ones', PRODUCTS.map((p) => firstSlug(p.slug)), ['dog-christmas-costume', 'reindeer-dog-hoodie', 'santa-pet-costume', OUTFIT]);
	const variantIds = async () =>
		(await db.execute('select id from product_variants order by id')).rows.map((r) => Number(r.id));
	const before = await variantIds();
	const title = async (slug: string) =>
		String(
			(
				await db.execute({
					sql: `select t.title from product_translations t join products p on p.id = t.product_id
					      where p.slug = ? and t.locale = 'en'`,
					args: [slug]
				})
			).rows[0]?.title
		);

	const first = await syncCatalogue(db);
	check('the sync walks each product through every rename, in order', first.renamed, SLUG_CHANGES.map((c) => c.to));
	check('and adds nothing beside them', first.added, []);
	check('still one row per product, with the life jacket', await count(db, 'select count(*) as n from products'), LISTED.length + 1);
	check('the same variants, so stock, SKUs and order lines carry over', await variantIds(), before);
	check(
		'every product is at its newest slug',
		(await db.execute('select slug from products order by id')).rows.map((r) => String(r.slug)),
		[...LISTED, 'life-jacket']
	);
	check(
		'and named with no pet, dog or cat',
		[await title(COSTUME), await title(REINDEER), await title(SANTA), await title(OUTFIT), await title('life-jacket')],
		['Christmas Tree Costume', 'Christmas Hoodie', 'Santa Costume with Gift', 'Santa Outfit', 'Life Jacket']
	);
	const second = await syncCatalogue(db);
	check('a second sync renames nothing', second.renamed, []);

	// A product someone added under a new slug by hand is never overwritten.
	const { db: db2, close: close2 } = openDb();
	await applySchema(db2);
	await addStore(db2);
	await syncCatalogue(db2);
	const def = PRODUCTS.find((p) => p.slug === SANTA)!;
	await insertProduct(db2, STORE_ID, {
		...def,
		slug: 'pet-santa-costume',
		variants: def.variants.map((v) => ({ ...v, sku: `OLD-${v.sku}` }))
	});
	const third = await syncCatalogue(db2);
	check('a rename onto a slug already in use does nothing', third.renamed, []);
	check('both rows stay', await count(db2, `select count(*) as n from products where slug in ('pet-santa-costume', '${SANTA}')`), 2);
	close2();
	close();
}

// --- a retired product still selling in a live store is archived, once ---------
{
	const { db, close } = openDb();
	await applySchema(db);
	await addStore(db);
	// The live store still has it: stand one in under its slug.
	const shape = PRODUCTS[0];
	await insertProduct(db, STORE_ID, {
		...shape,
		slug: RETIRED,
		variants: shape.variants.map((v) => ({ ...v, sku: `OLD-${v.sku}` }))
	});
	const status = async (slug: string) =>
		String((await db.execute({ sql: 'select status from products where slug = ?', args: [slug] })).rows[0].status);

	const first = await syncCatalogue(db);
	check('the sync archives it', first.archived, [RETIRED]);
	check('its row is archived, not deleted', await status(RETIRED), 'archived');
	check('its variants stay, for the orders that name them', await count(db, "select count(*) as n from product_variants where sku like 'OLD-%'"), shape.variants.length);
	check('the listed products are still active', [await status(COSTUME), await status(REINDEER)], ['active', 'active']);
	const second = await syncCatalogue(db);
	check('a second sync archives nothing', second.archived, []);

	// A status set by hand since is left alone.
	await db.execute({ sql: "update products set status = 'draft' where slug = ?", args: [RETIRED] });
	await syncCatalogue(db);
	check('a status set by hand is not overwritten', await status(RETIRED), 'draft');
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
		renamed: [],
		added: [],
		skipped: LISTED,
		repriced: [],
		recopied: [],
		archived: [],
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
