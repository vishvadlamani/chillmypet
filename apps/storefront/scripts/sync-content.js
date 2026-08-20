/**
 * Updates product copy in place, without recreating the catalogue.
 *
 * `db:seed` deletes and reinserts the product, which is impossible once an order
 * references a variant — so it is only usable on an empty store. This is the
 * path for a live one: it rewrites translations and content metafields and
 * touches nothing else, so prices, stock, variants and order history survive.
 *
 *   npm run db:content            # local
 *   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:content
 *
 * Idempotent: run it as often as you like. Source of truth is seed.js, so edit
 * the copy there and run this to publish it.
 */
import { createDb } from 'ecomwithai';
import { BENEFITS, FAQ, SIZE_CHART, SLUG, STORE, TRANSLATIONS } from './content.js';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

const product = await db.execute({
	sql: 'select id from products where store_id = ? and slug = ?',
	args: [STORE.id, SLUG]
});
if (!product.rows[0]) {
	console.error(`No product "${SLUG}" in ${url}. Run db:seed first.`);
	process.exit(1);
}
const productId = Number(product.rows[0].id);

let changed = 0;

for (const [locale, t] of Object.entries(TRANSLATIONS)) {
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
	console.log(`translation ${locale}: ${t.title}`);
}

// The unique index is (product_id, namespace, key, locale), so upsert rather
// than delete-then-insert — a failed run must not leave the page with no copy.
const upsertMetafield = async (key, locale, value, namespace = 'content') => {
	await db.execute({
		sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
		      values (?, ?, ?, ?, ?, ?)
		      on conflict (product_id, namespace, key, locale)
		        do update set value_json = excluded.value_json`,
		args: [STORE.id, productId, namespace, key, locale, JSON.stringify(value)]
	});
	changed += 1;
};

for (const [locale, entries] of Object.entries(BENEFITS)) {
	await upsertMetafield('benefits', locale, entries.map(([title, body]) => ({ title, body })));
	console.log(`benefits ${locale}: ${entries.length} entries`);
}

for (const [locale, entries] of Object.entries(FAQ)) {
	await upsertMetafield('faq', locale, entries.map(([q, a]) => ({ q, a })));
	console.log(`faq ${locale}: ${entries.length} entries`);
}

// Locale-independent: the numbers are the same everywhere and the storefront
// labels them in the visitor's language.
await upsertMetafield('size_chart', null, SIZE_CHART, 'specs');
console.log(`size chart: ${SIZE_CHART.length} sizes`);

console.log(`\nUpdated ${changed} content rows in ${url}. Stock, prices and orders untouched.`);
