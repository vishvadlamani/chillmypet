import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from 'ecomwithai/db';
import { paymentTestConfiguration, preparePaymentTestStore, PAYMENT_TEST_STORE } from './payment-test.ts';

const config = {
	PAYMENT_TEST_MODE: '1', STRIPE_SECRET_KEY: 'sk_test_example',
	STRIPE_PUBLISHABLE_KEY: 'pk_test_example', STRIPE_WEBHOOK_SECRET: 'whsec_example'
};
assert.deepEqual(paymentTestConfiguration({}, 'chillmypet.com'), { enabled: false });
assert.equal(paymentTestConfiguration(config, 'localhost').error, undefined);
assert.equal(paymentTestConfiguration(config, 'chillmypet-payment-test.example.workers.dev').error, undefined);
for (const hostname of ['chillmypet.com', 'www.chillmypet.com', 'chillmypet.example.workers.dev']) {
	assert.ok(paymentTestConfiguration(config, hostname).error, `reject production host ${hostname}`);
}
assert.ok(paymentTestConfiguration({ ...config, STRIPE_SECRET_KEY: 'sk_live_example' }, 'localhost').error);
assert.ok(paymentTestConfiguration({ ...config, STRIPE_PUBLISHABLE_KEY: 'pk_live_example' }, 'localhost').error);
assert.ok(paymentTestConfiguration({ ...config, STRIPE_WEBHOOK_SECRET: '' }, 'localhost').error);

const path = join(tmpdir(), `chillmypet-payment-sandbox-${process.pid}.db`);
const db = createDb({ url: `file:${path}` });
try {
	await preparePaymentTestStore(db);
	await db.execute("insert into stores (id, domain, name) values ('chillmypet', 'chillmypet.test', 'Production')");
	const variant = (await db.execute({ sql: 'select id, price_cents, stock from product_variants where store_id = ?', args: [PAYMENT_TEST_STORE] })).rows[0];
	assert.equal(Number(variant.price_cents), 100);
	await db.execute({ sql: 'update product_variants set stock = 999999 where id = ?', args: [variant.id] });
	await preparePaymentTestStore(db);
	assert.equal((await db.execute('select count(*) as n from products')).rows[0].n, 1);
	assert.equal((await db.execute({ sql: 'select stock from product_variants where id = ?', args: [variant.id] })).rows[0].stock, 999999);
	assert.equal((await db.execute("select count(*) as n from products where store_id = 'chillmypet'")).rows[0].n, 0);
	console.log('PASS sandbox rejects live keys and production hosts; $1 item is isolated and setup preserves stock');
} finally {
	db.close();
	for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });
}
