/**
 * Seeds this store into the framework's generic schema.
 *
 * Option *values* are stable codes ('blue_camo'), not display text, so the
 * storefront can translate them through its language packs while the framework
 * and any agent still get a readable `label`.
 *
 * Walks `PRODUCTS` from content.js. Everything below is per-product and knows
 * nothing about which product it is on — the catalogue's shape lives in that
 * file, and this one only writes it down.
 */
import { createDb, createStoreService } from 'ecomwithai';
import { PRODUCTS, STORE } from './content.js';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

// Public identifiers — both appear in the served page source.
const SETTINGS = {
	meta_pixel_id: '1363695699271757',
	meta_domain_verification: '0d821f82wjdsr4q7owd17wo659qt6h'
};

// --- store ---
await db.execute({
	sql: `insert into stores (id, domain, name, default_locale, currency)
	      values (?, ?, ?, ?, ?)
	      on conflict (id) do update set
	        domain = excluded.domain, name = excluded.name,
	        default_locale = excluded.default_locale, currency = excluded.currency`,
	args: [STORE.id, STORE.domain, STORE.name, STORE.locale, STORE.currency]
});

const stores = createStoreService(db);
for (const [key, value] of Object.entries(SETTINGS)) {
	await stores.setSetting(STORE.id, key, value);
}

// Deleting a product cascades to its variants, and `order_items.variant_id`
// has no ON DELETE action, so an order referencing one blocks the whole seed.
// That refusal is the schema protecting order history — but it surfaces as a
// bare SQLITE_CONSTRAINT_FOREIGNKEY stack trace, so say what actually happened.
//
// Checked for every product BEFORE writing any of them: a seed that recreates
// the first product and then aborts on the second has left the catalogue in a
// state neither the old run nor the new one describes.
for (const { slug } of PRODUCTS) {
	const referenced = await db.execute({
		sql: `select count(*) as count from order_items oi
		      join product_variants v on v.id = oi.variant_id
		      join products p on p.id = v.product_id
		      where p.store_id = ? and p.slug = ?`,
		args: [STORE.id, slug]
	});
	if (Number(referenced.rows[0].count) > 0) {
		console.error(
			`Refusing to reseed: ${referenced.rows[0].count} order line(s) reference ` +
				`variants of "${slug}" in ${url}.\n` +
				`Seeding recreates the product, which would orphan them.\n` +
				`On a throwaway database, delete the file and reseed. Against a real ` +
				`one, migrate the catalogue instead — those are customer orders.\n` +
				`To publish copy changes only, use \`npm run db:content\`.`
		);
		process.exit(1);
	}
}

const summary = [];

for (const p of PRODUCTS) {
	// --- product ---
	await db.execute({
		sql: 'delete from products where store_id = ? and slug = ?',
		args: [STORE.id, p.slug]
	});

	const product = await db.execute({
		sql: `insert into products (store_id, slug, status) values (?, ?, 'active')`,
		args: [STORE.id, p.slug]
	});
	const productId = Number(product.lastInsertRowid);

	for (const [locale, t] of Object.entries(p.translations)) {
		await db.execute({
			sql: `insert into product_translations
			        (store_id, product_id, locale, title, subtitle, description)
			      values (?, ?, ?, ?, ?, ?)`,
			args: [STORE.id, productId, locale, t.title, t.subtitle, t.description]
		});
	}

	// --- options ---
	// Colour first, then size. The order is positional and load-bearing: the
	// storefront reads `options[0]` as the colourway and `options[1]` as the
	// size everywhere from the buy box to the cart line.
	const optionIds = {};
	for (const [index, name] of ['Color', 'Size'].entries()) {
		const row = await db.execute({
			sql: `insert into product_options (store_id, product_id, name, position) values (?, ?, ?, ?)`,
			args: [STORE.id, productId, name, index]
		});
		optionIds[name] = Number(row.lastInsertRowid);
	}

	const colourValueIds = {};
	for (const [index, [code, label, hex]] of p.colours.entries()) {
		const row = await db.execute({
			sql: `insert into product_option_values
			        (store_id, option_id, value, label, swatch_hex, position)
			      values (?, ?, ?, ?, ?, ?)`,
			args: [STORE.id, optionIds.Color, code, label, hex, index]
		});
		colourValueIds[code] = Number(row.lastInsertRowid);
	}

	for (const [index, size] of p.sizes.entries()) {
		await db.execute({
			sql: `insert into product_option_values (store_id, option_id, value, label, position)
			      values (?, ?, ?, ?, ?)`,
			args: [STORE.id, optionIds.Size, size, size, index]
		});
	}

	// --- media ---
	// `colour` is optional. A photo tied to an option value is that colourway's
	// and the gallery swaps to it with the swatch; one without is the product's,
	// which is what a single-colourway product wants.
	for (const [index, photo] of (p.photos ?? []).entries()) {
		await db.execute({
			sql: `insert into product_media (store_id, product_id, url, alt, position, option_value_id)
			      values (?, ?, ?, ?, ?, ?)`,
			args: [STORE.id, productId, photo.url, photo.alt, index, colourValueIds[photo.colour] ?? null]
		});
	}

	// --- variants ---
	let variants = 0;
	let skipped = 0;
	for (const [code] of p.colours) {
		for (const size of p.sizes) {
			const stock = p.availability[code][size];
			if (stock === '-') {
				skipped += 1;
				continue;
			}
			await db.execute({
				sql: `insert into product_variants
				        (store_id, product_id, sku, price_cents, compare_at_cents, stock, position, option1, option2)
				      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					STORE.id,
					productId,
					`${p.skuPrefix}-${code.toUpperCase()}-${size}`,
					p.priceCents,
					p.compareAtCents,
					stock,
					variants,
					code,
					size
				]
			});
			variants += 1;
		}
	}

	// --- metafields: structured content the core does not model ---
	// An empty chart writes no row: `loadSizeChart` returns nothing for a missing
	// metafield, which is what drops the chart section rather than heading an
	// empty table. A `[]` row would resolve and render the heading alone.
	if (p.sizeChart.length > 0) {
		await db.execute({
			sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
			      values (?, ?, 'specs', 'size_chart', null, ?)`,
			args: [STORE.id, productId, JSON.stringify(p.sizeChart)]
		});
	}

	for (const [locale, entries] of Object.entries(p.benefits)) {
		await db.execute({
			sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
			      values (?, ?, 'content', 'benefits', ?, ?)`,
			args: [
				STORE.id,
				productId,
				locale,
				JSON.stringify(entries.map(([title, body]) => ({ title, body })))
			]
		});
	}

	for (const [locale, entries] of Object.entries(p.faq)) {
		await db.execute({
			sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
			      values (?, ?, 'content', 'faq', ?, ?)`,
			args: [
				STORE.id,
				productId,
				locale,
				JSON.stringify(entries.map(([q, a]) => ({ q, a })))
			]
		});
	}

	summary.push(
		`  ${p.slug}: ${p.colours.length} colour(s), ${p.sizes.length} sizes, ` +
			`${variants} variants (${skipped} not offered), ` +
			`${p.sizeChart.length ? `${p.sizeChart.length}-row size chart` : 'NO SIZE CHART'}, ` +
			`${(p.photos ?? []).length} image(s)`
	);
}

console.log(
	`Seeded "${STORE.id}" (${STORE.domain}), ` +
		`${Object.keys(PRODUCTS[0].translations).length} locales:\n${summary.join('\n')}`
);
db.close();
