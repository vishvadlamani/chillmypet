/**
 * Updates product copy in place, without recreating the catalogue.
 *
 * `db:seed` deletes and reinserts every product, which is impossible once an
 * order references a variant — so it is only usable on an empty store. This is
 * the path for a live one: it rewrites translations and content metafields and
 * touches nothing else, so prices, stock, variants and order history survive.
 *
 *   npm run db:content            # local
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:content
 *
 * Idempotent: run it as often as you like. Source of truth is content.js, so
 * edit the copy there and run this to publish it.
 *
 * A product in content.js that the store has never been seeded with is reported
 * and skipped, not created — creating it here would mint a product with no
 * variants and no price, which the storefront would render as a buyable page
 * that cannot be bought.
 */
import { createDb } from 'ecomwithai';
import { PRODUCTS, STORE } from './content.js';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

// The unique index is (product_id, namespace, key, locale), so upsert rather
// than delete-then-insert — a failed run must not leave the page with no copy.
const upsertMetafield = async (productId, key, locale, value, namespace = 'content') => {
	await db.execute({
		sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
		      values (?, ?, ?, ?, ?, ?)
		      on conflict (product_id, namespace, key, locale)
		        do update set value_json = excluded.value_json`,
		args: [STORE.id, productId, namespace, key, locale, JSON.stringify(value)]
	});
};

let changed = 0;
let missing = 0;

for (const p of PRODUCTS) {
	const product = await db.execute({
		sql: 'select id from products where store_id = ? and slug = ?',
		args: [STORE.id, p.slug]
	});
	if (!product.rows[0]) {
		console.error(`skipped ${p.slug}: not in ${url}. Run db:seed on a store with no orders.`);
		missing += 1;
		continue;
	}
	const productId = Number(product.rows[0].id);
	console.log(`\n${p.slug}`);

	for (const [locale, t] of Object.entries(p.translations)) {
		const result = await db.execute({
			sql: `update product_translations
			      set title = ?, subtitle = ?, description = ?
			      where store_id = ? and product_id = ? and locale = ?`,
			args: [t.title, t.subtitle, t.description, STORE.id, productId, locale]
		});
		if (result.rowsAffected === 0) {
			await db.execute({
				sql: `insert into product_translations
				        (store_id, product_id, locale, title, subtitle, description)
				      values (?, ?, ?, ?, ?, ?)`,
				args: [STORE.id, productId, locale, t.title, t.subtitle, t.description]
			});
		}
		changed += 1;
		console.log(`  translation ${locale}: ${t.title}`);
	}

	for (const [locale, entries] of Object.entries(p.benefits)) {
		await upsertMetafield(productId, 'benefits', locale, entries.map(([title, body]) => ({ title, body })));
		changed += 1;
		console.log(`  benefits ${locale}: ${entries.length} entries`);
	}

	for (const [locale, entries] of Object.entries(p.faq)) {
		await upsertMetafield(productId, 'faq', locale, entries.map(([q, a]) => ({ q, a })));
		changed += 1;
		console.log(`  faq ${locale}: ${entries.length} entries`);
	}

	// Locale-independent: the numbers are the same everywhere and the storefront
	// labels them in the visitor's language.
	//
	// An empty chart DELETES the row rather than writing `[]`. A product whose
	// supplier measurements were withdrawn must lose its chart section, and an
	// empty array resolves — which would leave the heading over nothing.
	if (p.sizeChart.length > 0) {
		await upsertMetafield(productId, 'size_chart', null, p.sizeChart, 'specs');
		changed += 1;
		console.log(`  size chart: ${p.sizeChart.length} sizes`);
	} else {
		const dropped = await db.execute({
			sql: `delete from product_metafields
			      where store_id = ? and product_id = ? and namespace = 'specs' and key = 'size_chart'`,
			args: [STORE.id, productId]
		});
		changed += dropped.rowsAffected;
		console.log('  size chart: none published (no supplier measurements)');
	}
}

console.log(`\nUpdated ${changed} content rows in ${url}. Stock, prices and orders untouched.`);
if (missing > 0) process.exitCode = 1;
