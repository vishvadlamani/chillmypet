/**
 * Multi-tenancy is the property the whole package rests on: one leak between
 * stores is a data breach, not a bug. These run against a throwaway SQLite file.
 *
 *   npm test -w @chillmypet/commerce
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommerce, createDirectory } from './index.ts';
import type { Store } from './stores/index.ts';

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

const dir = await mkdtemp(join(tmpdir(), 'commerce-tenancy-'));
const { db, stores } = createDirectory({ url: `file:${join(dir, 'test.db')}` });

const schema = await readFile(new URL('./db/schema.sql', import.meta.url), 'utf8');
for (const statement of schema
	.split(';')
	.map((s) => s.trim())
	.filter((s) => s && !s.split('\n').every((l) => l.trim().startsWith('--')))) {
	await db.execute(statement);
}

async function seedStore(id: string, domain: string, slug: string, priceCents: number) {
	await db.execute({
		sql: `insert into stores (id, domain, name, default_locale, currency) values (?, ?, ?, 'en', 'USD')`,
		args: [id, domain, id]
	});
	const product = await db.execute({
		sql: `insert into products (store_id, slug, price_cents, currency) values (?, ?, ?, 'USD')`,
		args: [id, slug, priceCents]
	});
	const productId = Number(product.lastInsertRowid);
	await db.execute({
		sql: `insert into product_colours (store_id, product_id, code, hex) values (?, ?, 'blue', '#0000ff')`,
		args: [id, productId]
	});
	await db.execute({
		sql: `insert into size_chart (store_id, product_id, size, chest_min_cm, chest_max_cm, weight_min_kg, weight_max_kg)
		      values (?, ?, 'M', 50, 60, 10, 20)`,
		args: [id, productId]
	});
	const variant = await db.execute({
		sql: `insert into product_variants (store_id, product_id, colour, size, sku, stock)
		      values (?, ?, 'blue', 'M', ?, 5)`,
		args: [id, productId, `${id.toUpperCase()}-BLUE-M`]
	});
	return Number(variant.lastInsertRowid);
}

const alphaVariant = await seedStore('alpha', 'alpha.test', 'alpha-jacket', 1000);
const bravoVariant = await seedStore('bravo', 'bravo.test', 'bravo-collar', 2500);

// --- store resolution ---
const alphaStore = (await stores.byDomain('alpha.test')) as Store;
const bravoStore = (await stores.byDomain('bravo.test')) as Store;
check('resolves store by domain', alphaStore?.id, 'alpha');
check('host port is ignored', (await stores.byDomain('bravo.test:5173'))?.id, 'bravo');
check('unknown domain resolves to null', await stores.byDomain('nope.test'), null);

const alpha = createCommerce({ db, store: alphaStore });
const bravo = createCommerce({ db, store: bravoStore });

// --- catalog isolation ---
check('own product is visible', (await alpha.catalog.getProduct('alpha-jacket'))?.slug, 'alpha-jacket');
check("another store's product is not", await alpha.catalog.getProduct('bravo-collar'), null);

const crossPriced = await alpha.catalog.priceVariants([bravoVariant]);
check("cannot price another store's variant", crossPriced.size, 0);

const ownPriced = await alpha.catalog.priceVariants([alphaVariant]);
check('can price own variant', ownPriced.get(alphaVariant)?.unitPriceCents, 1000);

// --- ordering across tenants ---
let crossStoreOrder = 'no error';
try {
	await alpha.orders.create({
		lines: [{ variantId: bravoVariant, quantity: 1 }],
		method: 'standard',
		locale: 'en',
		shipping: {
			email: 'x@example.com',
			firstName: 'X',
			lastName: 'Y',
			address1: '1 St',
			city: 'Lisbon',
			postalCode: '1100',
			country: 'PT'
		}
	});
} catch (error) {
	crossStoreOrder = (error as { code?: string }).code ?? 'unknown';
}
check("ordering another store's variant is rejected", crossStoreOrder, 'variant_unavailable');

const bravoStock = await db.execute({
	sql: 'select stock from product_variants where id = ?',
	args: [bravoVariant]
});
check('rejected cross-store order left stock untouched', Number(bravoStock.rows[0].stock), 5);

// --- customers are per store ---
const shipping = {
	email: 'Shared@Example.com',
	firstName: 'Shared',
	lastName: 'Buyer',
	address1: '1 St',
	city: 'Lisbon',
	postalCode: '1100',
	country: 'PT'
};

const first = await alpha.orders.create({
	lines: [{ variantId: alphaVariant, quantity: 2 }],
	method: 'standard',
	locale: 'en',
	shipping
});
check('order total uses server-side price', first.totalCents, 2000);

const second = await alpha.orders.create({
	lines: [{ variantId: alphaVariant, quantity: 1 }],
	method: 'express',
	locale: 'en',
	shipping
});
check('repeat buyer reuses one customer row', second.customerId, first.customerId);

const alphaCustomer = await alpha.customers.byEmail('shared@example.com');
check('lifetime order count rolls up', alphaCustomer?.ordersCount, 2);
check('lifetime spend rolls up', alphaCustomer?.totalSpentCents, 2000 + 1000 + 1200);
check('email is normalized on write', alphaCustomer?.email, 'shared@example.com');

await bravo.orders.create({
	lines: [{ variantId: bravoVariant, quantity: 1 }],
	method: 'standard',
	locale: 'en',
	shipping
});
const bravoCustomer = await bravo.customers.byEmail('shared@example.com');
check('same email is a separate customer per store', bravoCustomer?.id !== alphaCustomer?.id, true);
check("other store's history does not leak", bravoCustomer?.ordersCount, 1);

// --- stock guard still holds ---
let oversell = 'no error';
try {
	await alpha.orders.create({
		lines: [{ variantId: alphaVariant, quantity: 99 }],
		method: 'standard',
		locale: 'en',
		shipping
	});
} catch (error) {
	oversell = (error as { code?: string }).code ?? 'unknown';
}
check('overselling is rejected', oversell, 'variant_unavailable');

db.close();
await rm(dir, { recursive: true, force: true });

console.log(failures ? `\n${failures} failure(s)` : '\nTenant isolation verified.');
process.exitCode = failures ? 1 : 0;
