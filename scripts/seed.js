import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });

const SLUG = 'dog-life-jacket';

// Colour codes match `product.colors.*` keys in the language packs.
const COLOURS = [
	['sailboat', '#1e4e8c'],
	['blue_camo', '#4a6fa5'],
	['green', '#3f7d53'],
	['pink_camo', '#c98ba8'],
	['floral', '#d96b8a'],
	['yellow', '#e8b838'],
	['blue', '#2d7dd2'],
	['pink', '#e86aa0'],
	['purple', '#7b5ea7'],
	['red', '#c63b3b']
];

const SIZES = [
	{ size: 'XS', chest: [33, 43], weight: [2, 5] },
	{ size: 'S', chest: [43, 53], weight: [5, 9] },
	{ size: 'M', chest: [53, 64], weight: [9, 16] },
	{ size: 'L', chest: [64, 76], weight: [16, 27] },
	{ size: 'XL', chest: [76, 91], weight: [27, 45] }
];

const existing = await client.execute({
	sql: 'select id from products where slug = ?',
	args: [SLUG]
});

if (existing.rows[0]) {
	await client.execute({ sql: 'delete from products where slug = ?', args: [SLUG] });
}

const product = await client.execute({
	sql: `insert into products (slug, price_cents, compare_at_cents, currency, active)
	      values (?, ?, ?, ?, 1)`,
	args: [SLUG, 4497, 6397, 'USD']
});
const productId = Number(product.lastInsertRowid);

for (const [index, [code, hex]] of COLOURS.entries()) {
	await client.execute({
		sql: `insert into product_colours (product_id, code, hex, position) values (?, ?, ?, ?)`,
		args: [productId, code, hex, index]
	});
}

for (const [index, row] of SIZES.entries()) {
	await client.execute({
		sql: `insert into size_chart
		        (product_id, size, chest_min_cm, chest_max_cm, weight_min_kg, weight_max_kg, position)
		      values (?, ?, ?, ?, ?, ?, ?)`,
		args: [productId, row.size, row.chest[0], row.chest[1], row.weight[0], row.weight[1], index]
	});
}

let variants = 0;
for (const [code] of COLOURS) {
	for (const { size } of SIZES) {
		// One deliberately empty variant so the out-of-stock path is reachable
		// without editing data by hand.
		const stock = code === 'floral' && size === 'XS' ? 0 : 12;
		await client.execute({
			sql: `insert into product_variants (product_id, colour, size, sku, stock)
			      values (?, ?, ?, ?, ?)`,
			args: [productId, code, size, `CMP-LJ-${code.toUpperCase()}-${size}`, stock]
		});
		variants += 1;
	}
}

console.log(`Seeded ${SLUG}: ${COLOURS.length} colours, ${SIZES.length} sizes, ${variants} variants`);
client.close();
