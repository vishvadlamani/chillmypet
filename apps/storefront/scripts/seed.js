import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });

const STORE = {
	id: process.env.SEED_STORE_ID ?? 'chillmypet',
	domain: process.env.SEED_STORE_DOMAIN ?? 'chillmypet.com',
	name: 'ChillMyPet',
	defaultLocale: 'en',
	currency: 'USD',
	// Public identifiers, not secrets — both appear in the served page source.
	metaPixelId: '28272021345717397',
	metaDomainVerification: '0d821f82wjdsr4q7owd17wo659qt6h'
};

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

// Mirrors the source catalogue: '-' means the combination isn't sold at all,
// 0 means listed but out of stock.
const AVAILABILITY = {
	sailboat:  { XS: 0,  S: 12, M: 0,  L: 12, XL: '-' },
	blue_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	green:     { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	pink_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	floral:    { XS: 12, S: 12, M: 12, L: 12, XL: '-' },
	yellow:    { XS: 0,  S: 0,  M: 0,  L: 0,  XL: 12 },
	blue:      { XS: 12, S: 12, M: 12, L: 0,  XL: 0 },
	pink:      { XS: 0,  S: 12, M: 0,  L: 0,  XL: 12 },
	purple:    { XS: 0,  S: 0,  M: 0,  L: 0,  XL: '-' },
	red:       { XS: 12, S: 12, M: 0,  L: 0,  XL: 12 }
};

const SIZES = [
	{ size: 'XS', chest: [33, 43], weight: [2, 5] },
	{ size: 'S', chest: [43, 53], weight: [5, 9] },
	{ size: 'M', chest: [53, 64], weight: [9, 16] },
	{ size: 'L', chest: [64, 76], weight: [16, 27] },
	{ size: 'XL', chest: [76, 91], weight: [27, 45] }
];

await client.execute({
	sql: `insert into stores
	        (id, domain, name, default_locale, currency, meta_pixel_id, meta_domain_verification)
	      values (?, ?, ?, ?, ?, ?, ?)
	      on conflict (id) do update set
	        domain = excluded.domain,
	        name = excluded.name,
	        default_locale = excluded.default_locale,
	        currency = excluded.currency,
	        meta_pixel_id = excluded.meta_pixel_id,
	        meta_domain_verification = excluded.meta_domain_verification`,
	args: [
		STORE.id,
		STORE.domain,
		STORE.name,
		STORE.defaultLocale,
		STORE.currency,
		STORE.metaPixelId,
		STORE.metaDomainVerification
	]
});

await client.execute({
	sql: 'delete from products where store_id = ? and slug = ?',
	args: [STORE.id, SLUG]
});

const product = await client.execute({
	sql: `insert into products (store_id, slug, price_cents, compare_at_cents, currency, active)
	      values (?, ?, ?, ?, ?, 1)`,
	args: [STORE.id, SLUG, 4497, 6397, STORE.currency]
});
const productId = Number(product.lastInsertRowid);

for (const [index, [code, hex]] of COLOURS.entries()) {
	await client.execute({
		sql: `insert into product_colours (store_id, product_id, code, hex, image_path, position)
		      values (?, ?, ?, ?, ?, ?)`,
		args: [STORE.id, productId, code, hex, `/products/${SLUG}/${code}.jpg`, index]
	});
}

for (const [index, row] of SIZES.entries()) {
	await client.execute({
		sql: `insert into size_chart
		        (store_id, product_id, size, chest_min_cm, chest_max_cm,
		         weight_min_kg, weight_max_kg, position)
		      values (?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			STORE.id,
			productId,
			row.size,
			row.chest[0],
			row.chest[1],
			row.weight[0],
			row.weight[1],
			index
		]
	});
}

let variants = 0;
let skipped = 0;
for (const [code] of COLOURS) {
	for (const { size } of SIZES) {
		const stock = AVAILABILITY[code][size];
		// Not offered at all — no variant row, so the size renders unselectable.
		if (stock === '-') {
			skipped += 1;
			continue;
		}
		await client.execute({
			sql: `insert into product_variants (store_id, product_id, colour, size, sku, stock)
			      values (?, ?, ?, ?, ?, ?)`,
			args: [STORE.id, productId, code, size, `CMP-LJ-${code.toUpperCase()}-${size}`, stock]
		});
		variants += 1;
	}
}

console.log(
	`Seeded store "${STORE.id}" (${STORE.domain}): ${SLUG} with ` +
		`${COLOURS.length} colours, ${SIZES.length} sizes, ${variants} variants ` +
		`(${skipped} combinations not offered)`
);
client.close();
