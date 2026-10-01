/**
 * Seeds this store into the framework's generic schema.
 *
 * Destructive: every product here is deleted and recreated, so this is for a
 * fresh or throwaway database. `add-products.js` is the path for a live one.
 */
import { createDb, createStoreService } from 'ecomwithai';
import { insertProduct, orderLines } from './catalog.js';
import { BENEFITS, FAQ, SIZE_CHART, SLUG, STORE, TRANSLATIONS } from './content.js';
import { HOODIE } from './hoodie.js';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

// Public identifiers — all of these appear in the served page source.
//
// These are only the fallback: hooks.server.ts prefers the env vars, which is
// how wrangler.toml corrects a deployed store without a database write. They
// still matter, because a fresh local database is what the browser tests run
// against — leave the retired pixel here and a developer verifies tracking
// against a dataset no ad account reads.
const SETTINGS = {
	// Ad account 1550461850095009, portfolio "Vish Ads". Gets browser events
	// and the Conversions API copy. See wrangler.toml for the full roster.
	meta_pixel_id: '1341978141149107',
	// Browser events only: the retired CZK ad account, and a second account
	// measuring the same pages.
	meta_extra_pixel_ids: '1363695699271757,28272021345717397',
	meta_domain_verification: '0d821f82wjdsr4q7owd17wo659qt6h'
};

const PRICE_CENTS = 4497;
const COMPARE_AT_CENTS = 6397;

const COLOURS = [
	['sailboat', 'Sailboat', '#1e4e8c'],
	['blue_camo', 'Blue Camo', '#4a6fa5'],
	['green', 'Green', '#3f7d53'],
	['pink_camo', 'Pink Camo', '#c98ba8'],
	['floral', 'Floral', '#d96b8a'],
	['yellow', 'Yellow', '#e8b838'],
	['blue', 'Blue', '#2d7dd2'],
	['pink', 'Pink', '#e86aa0'],
	['purple', 'Purple', '#7b5ea7'],
	['red', 'Red', '#c63b3b']
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

// '-' means the combination is not offered at all; 0 means listed but empty.
const AVAILABILITY = {
	sailboat: { XS: 0, S: 12, M: 0, L: 12, XL: '-' },
	blue_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	green: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	pink_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	floral: { XS: 12, S: 12, M: 12, L: 12, XL: '-' },
	yellow: { XS: 0, S: 0, M: 0, L: 0, XL: 12 },
	blue: { XS: 12, S: 12, M: 12, L: 0, XL: 0 },
	pink: { XS: 0, S: 12, M: 0, L: 0, XL: 12 },
	purple: { XS: 0, S: 0, M: 0, L: 0, XL: '-' },
	red: { XS: 12, S: 12, M: 0, L: 0, XL: 12 }
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

// --- products ---
const SIZE_VALUES = SIZES.map((size) => ({ code: size, label: size }));

/** @type {import('./catalog.js').ProductDefinition} */
const LIFE_JACKET = {
	slug: SLUG,
	position: 0,
	translations: TRANSLATIONS,
	options: [
		{ name: 'Color', values: COLOURS.map(([code, label, hex]) => ({ code, label, hex })) },
		{ name: 'Size', values: SIZE_VALUES }
	],
	// One photo per colour.
	media: COLOURS.map(([code, label]) => ({
		url: `/products/${SLUG}/${code}.jpg`,
		alt: `${TRANSLATIONS.en.title} in ${label}`,
		option: code
	})),
	variants: COLOURS.flatMap(([code]) =>
		SIZES.filter((size) => AVAILABILITY[code][size] !== '-').map((size) => ({
			sku: `CMP-LJ-${code.toUpperCase()}-${size}`,
			priceCents: PRICE_CENTS,
			compareAtCents: COMPARE_AT_CENTS,
			stock: AVAILABILITY[code][size],
			options: [code, size]
		}))
	),
	// Structured content the core does not model.
	metafields: [
		{ namespace: 'specs', key: 'size_chart', locale: null, value: SIZE_CHART },
		...Object.entries(BENEFITS).map(([locale, entries]) => ({
			namespace: 'content',
			key: 'benefits',
			locale,
			value: entries.map(([title, body]) => ({ title, body }))
		})),
		...Object.entries(FAQ).map(([locale, entries]) => ({
			namespace: 'content',
			key: 'faq',
			locale,
			value: entries.map(([q, a]) => ({ q, a }))
		}))
	]
};

const PRODUCTS = [LIFE_JACKET, HOODIE];

// Deleting a product cascades to its variants, and `order_items.variant_id`
// has no ON DELETE action, so an order referencing one blocks the whole seed.
// That refusal is the schema protecting order history — but it surfaces as a
// bare SQLITE_CONSTRAINT_FOREIGNKEY stack trace, so say what actually happened.
// Checked for every product before deleting any, so a refusal leaves the
// catalogue exactly as it was.
for (const { slug } of PRODUCTS) {
	const referenced = await orderLines(db, STORE.id, slug);
	if (referenced > 0) {
		console.error(
			`Refusing to reseed: ${referenced} order line(s) reference ` +
				`variants of "${slug}" in ${url}.\n` +
				`Seeding recreates the product, which would orphan them.\n` +
				`On a throwaway database, delete the file and reseed. Against a real ` +
				`one, migrate the catalogue instead — those are customer orders. ` +
				`To add a new product to a live store, use db:products.`
		);
		process.exit(1);
	}
}

for (const { slug } of PRODUCTS) {
	await db.execute({
		sql: 'delete from products where store_id = ? and slug = ?',
		args: [STORE.id, slug]
	});
}

for (const def of PRODUCTS) {
	const { variants } = await insertProduct(db, STORE.id, def);
	console.log(
		`Seeded "${STORE.id}" (${STORE.domain}): ${def.slug} with ${def.options[0].values.length} colour(s), ` +
			`${def.options[1].values.length} sizes, ${variants} variants, ` +
			`${Object.keys(def.translations).length} locale(s)`
	);
}

db.close();
