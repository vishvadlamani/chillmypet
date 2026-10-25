import { applySchema, type Client } from 'ecomwithai/db';
import { insertProduct, productExists } from '../../../scripts/catalog.js';

export const PAYMENT_TEST_STORE = 'chillmypet-payment-test';
export const PAYMENT_TEST_SLUG = 'payment-test';
export const PAYMENT_TEST_SKU = 'CMP-SANDBOX-ONE-DOLLAR';

/** Fail closed before a test deployment can read a tenant or create a payment. */
export function paymentTestConfiguration(
	env: Record<string, string | undefined>,
	hostname: string
): { enabled: boolean; error?: string } {
	if (env.PAYMENT_TEST_MODE !== '1') return { enabled: false };
	if (!['localhost', '127.0.0.1'].includes(hostname) && !/^chillmypet-payment-test\.[a-z0-9-]+\.workers\.dev$/.test(hostname)) {
		return { enabled: true, error: 'Payment tests require the separate sandbox address.' };
	}
	if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '') || !/^pk_test_/.test(env.STRIPE_PUBLISHABLE_KEY ?? '')) {
		return { enabled: true, error: 'Configure Stripe sandbox keys. Live payment keys are not accepted.' };
	}
	if (!env.STRIPE_WEBHOOK_SECRET) return { enabled: true, error: 'Configure the sandbox webhook signing secret.' };
	return { enabled: true };
}

/** A separate tenant: no production catalogue, stock, customer or order is reused. */
export async function preparePaymentTestStore(db: Client): Promise<void> {
	await applySchema(db);
	await db.execute({
		sql: `insert into stores (id, domain, name, default_locale, currency)
		      values (?, 'payment-test.invalid', 'ChillMyPet Sandbox', 'en', 'USD')
		      on conflict (id) do nothing`,
		args: [PAYMENT_TEST_STORE]
	});
	if (await productExists(db, PAYMENT_TEST_STORE, PAYMENT_TEST_SLUG)) return;
	try {
		await insertProduct(db, PAYMENT_TEST_STORE, {
			slug: PAYMENT_TEST_SLUG,
			translations: { en: { title: '$1.00 payment test', description: 'Sandbox only. No charge or shipment.' } },
			options: [],
			media: [{ url: '/brand/favicon-32.png', alt: 'Payment test' }],
			variants: [{ sku: PAYMENT_TEST_SKU, priceCents: 100, stock: 1000000, options: [] }]
		});
	} catch (error) {
		if (!(await productExists(db, PAYMENT_TEST_STORE, PAYMENT_TEST_SLUG))) throw error;
	}
}
