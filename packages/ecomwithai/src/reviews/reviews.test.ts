import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommerce, createStoreService, applyCartDiscounts } from '../index.ts';
import { createTestDb, seedProduct, seedStore } from '../testing.ts';

const breaks = [{ minQuantity: 2, percentOff: 7 }, { minQuantity: 3, percentOff: 9 }];
const line = (quantity: number, productSlug = 'costume', unitPriceCents = 2799) => ({ productSlug, unitPriceCents, quantity });
for (const [quantity, discount] of [[1, 0], [2, 2799], [3, 2799], [4, 5598]]) {
	assert.equal(applyCartDiscounts(breaks, [line(quantity)], ['costume']).discountCents, discount);
}
assert.equal(applyCartDiscounts(breaks, [line(1), line(1)], ['costume']).discountCents, 2799);
assert.equal(applyCartDiscounts(breaks, [line(1), line(1, 'costume', 1999)], ['costume']).discountCents, 1999);
assert.equal(applyCartDiscounts(breaks, [line(1), line(1, 'hoodie')], ['costume']).discountCents, 0);
assert.equal(applyCartDiscounts(breaks, [line(2), line(2, 'hoodie', 1000)], ['costume']).discountCents, 2939);
assert.equal(applyCartDiscounts(breaks, [line(2, 'hoodie')], ['costume']).discountCents, 392);

const dir = await mkdtemp(join(tmpdir(), 'reviews-bogo-'));
const db = await createTestDb(`file:${join(dir, 'test.db')}`);
try {
	await seedStore(db, { id: 'alpha', domain: 'alpha.test' });
	await seedStore(db, { id: 'bravo', domain: 'bravo.test' });
	await seedProduct(db, 'alpha', { slug: 'costume', title: 'Costume', variants: [{ sku: 'C-1', priceCents: 2799, stock: 20 }] });
	await seedProduct(db, 'bravo', { slug: 'costume', title: 'Other costume', variants: [{ sku: 'C-2', priceCents: 2799, stock: 20 }] });
	const stores = createStoreService(db);
	const alpha = createCommerce({ db, store: (await stores.byId('alpha'))!, quantityBreaks: breaks, buyOneGetOneFree: ['costume'], shippingRates: [{ id: 'standard', priceCents: 0 }] });
	const bravo = createCommerce({ db, store: (await stores.byId('bravo'))! });
	const input = { productSlug: 'costume', author: 'A customer', rating: 1, body: 'The fit was smaller than expected.' };
	assert.equal(await alpha.reviews.submit({ ...input, rating: 6 }), false);
	assert.equal(await alpha.reviews.submit({ ...input, productSlug: 'missing' }), false);
	assert.equal(await alpha.reviews.submit(input), true);
	assert.equal((await alpha.reviews.publicFor('costume')).count, 0);
	const pending = await alpha.reviews.list('pending');
	assert.equal(pending.length, 1);
	assert.equal((await bravo.reviews.list('pending')).length, 0);
	assert.equal(await bravo.reviews.moderate(pending[0].id, 'published'), false);
	assert.equal(await alpha.reviews.moderate(pending[0].id, 'published'), true);
	assert.equal((await alpha.reviews.publicFor('costume')).average, 1);
	assert.equal((await bravo.reviews.publicFor('costume')).count, 0);
	assert.equal(await alpha.reviews.moderate(pending[0].id, 'hidden'), true);
	assert.equal((await alpha.reviews.publicFor('costume')).count, 0);
	const catalogue = await alpha.catalog.getProduct('costume');
	const variantId = catalogue!.variants[0].id;
	const order = await alpha.orders.create({
		lines: [{ variantId, quantity: 1 }, { variantId, quantity: 1 }], method: 'standard',
		shipping: { email: 'buyer@example.com', firstName: 'Test', lastName: 'Buyer', address1: '1 Main St', city: 'Boston', postalCode: '02108', country: 'US' }
	});
	assert.equal(order.discountCents, 2799);
	assert.equal(order.totalCents, 2799);
	assert.equal(order.items[0].quantity, 2);
	assert.equal((await alpha.catalog.getProduct('costume'))!.variants[0].stock, 18);
	console.log('PASS  BOGO scope, pairs, odd quantities, mixed carts, stock and review moderation/isolation');
} finally {
	db.close();
	await rm(dir, { recursive: true, force: true });
}
