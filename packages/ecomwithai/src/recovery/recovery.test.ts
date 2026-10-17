/**
 * The rules that keep a checkout reminder from becoming spam: one per address,
 * never after a purchase or an opt-out, never twice from racing sweeps, and
 * drafts that do not outlive their use.
 *
 *   node --experimental-strip-types src/recovery/recovery.test.ts
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCommerce, createStoreService } from '../index.ts';
import { createTestDb, seedProduct, seedStore } from '../testing.ts';
import type { Store } from '../stores/index.ts';

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

const dir = await mkdtemp(join(tmpdir(), 'ecomwithai-recovery-'));
const db = await createTestDb(`file:${join(dir, 'test.db')}`);
await seedStore(db, { id: 'shop', domain: 'shop.test' });
const seed = await seedProduct(db, 'shop', {
	slug: 'cape',
	title: 'Tree Cape',
	variants: [
		{ sku: 'CAPE-S', priceCents: 2850, stock: 50 },
		{ sku: 'CAPE-M', priceCents: 2850, stock: 50 }
	]
});
const S = seed.variantIds['CAPE-S'];
const M = seed.variantIds['CAPE-M'];
const store = (await createStoreService(db).byId('shop')) as Store;
const { recovery, orders } = createCommerce({ db, store });

/** Moves a draft's clock back, as if the shopper had left that long ago. */
async function age(token: string, sql: string) {
	await db.execute({
		sql: `update checkout_drafts set created_at = datetime('now', ?), updated_at = datetime('now', ?) where token = ?`,
		args: [sql, sql, token]
	});
}
const dueEmails = async () => (await recovery.due()).map((d) => d.email);

// --- what a draft accepts ---------------------------------------------------------
check('a malformed email is refused', await recovery.saveDraft({ email: 'not-an-email', lines: [{ variantId: S, quantity: 1 }] }), null);
check('an empty cart is refused', await recovery.saveDraft({ email: 'a@b.co', lines: [] }), null);
check(
	'a cart of nonsense lines is refused',
	await recovery.saveDraft({ email: 'a@b.co', lines: [{ variantId: -1, quantity: 1 }, { variantId: 'x', quantity: 2 } as never] }),
	null
);

const one = (await recovery.saveDraft({
	email: '  Holly@Example.COM ',
	firstName: '  Holly ',
	lines: [
		{ variantId: S, quantity: 4 },
		{ variantId: S, quantity: 9 },
		{ variantId: M, quantity: 1 }
	],
	locale: 'es'
})) as string;
check('a good draft returns a token', /^[0-9a-f]{48}$/.test(one), true);
const saved = await recovery.byToken(one);
check('the email is normalised', saved?.email, 'holly@example.com');
check('the name is trimmed', saved?.firstName, 'Holly');
check('repeated variants merge and quantities are capped', saved?.lines, [
	{ variantId: S, quantity: 10 },
	{ variantId: M, quantity: 1 }
]);
check('the locale is kept', saved?.locale, 'es');
check('an unknown locale falls back to the store default', (await recovery.byToken((await recovery.saveDraft({ email: 'x@y.co', lines: [{ variantId: S, quantity: 1 }], locale: '<script>' }))!))?.locale, 'en');
check('a malformed token reads nothing', await recovery.byToken('nope'), null);

// --- when a reminder is due ------------------------------------------------------
check('a fresh draft is not due', (await dueEmails()).includes('holly@example.com'), false);
await age(one, '-61 minutes');
check('an hour after they left, it is due', (await dueEmails()).includes('holly@example.com'), true);
check('the idle time is configurable', (await recovery.due({ idleMinutes: 120 })).some((d) => d.token === one), false);
await age(one, '-49 hours');
check('too old to remind is never due', (await dueEmails()).includes('holly@example.com'), false);
await age(one, '-2 hours');

// --- the same address starting another cart --------------------------------------
const again = await recovery.saveDraft({ email: 'holly@example.com', lines: [{ variantId: M, quantity: 2 }] });
check('a second cart on the same address keeps the token', again, one);
check('and replaces the lines', (await recovery.byToken(one))?.lines, [{ variantId: M, quantity: 2 }]);
check('and keeps the name it had', (await recovery.byToken(one))?.firstName, 'Holly');
check('and restarts the idle clock', (await dueEmails()).includes('holly@example.com'), false);
await age(one, '-2 hours');

// --- claiming ------------------------------------------------------------------
const [first, second] = await Promise.all([recovery.claim(one), recovery.claim(one)]);
check('two sweeps racing: exactly one claim wins', [first, second].filter(Boolean).length, 1);
check('a claimed draft is no longer due', (await dueEmails()).includes('holly@example.com'), false);
await recovery.release(one);
check('a released claim is due again', (await dueEmails()).includes('holly@example.com'), true);
check('claim it for real', await recovery.claim(one), true);
await recovery.saveDraft({ email: 'holly@example.com', lines: [{ variantId: S, quantity: 1 }] });
await age(one, '-3 hours');
check('a new cart within 30 days is not reminded again', (await dueEmails()).includes('holly@example.com'), false);
await db.execute({ sql: "update checkout_drafts set reminded_at = datetime('now', '-31 days') where token = ?", args: [one] });
check('after 30 days the address can be reminded again', (await dueEmails()).includes('holly@example.com'), true);

// --- buying ----------------------------------------------------------------------
const shipping = {
	firstName: 'Ivy',
	lastName: 'Green',
	address1: '1 Tree St',
	city: 'Austin',
	province: 'TX',
	postalCode: '78701',
	country: 'US'
};
const buyer = (await recovery.saveDraft({ email: 'ivy@example.com', lines: [{ variantId: S, quantity: 1 }] })) as string;
await age(buyer, '-3 hours');
const before = await orders.create({ lines: [{ variantId: S, quantity: 1 }], method: 'standard', shipping: { ...shipping, email: 'IVY@example.com' } });
await orders.setStatus(before.orderNumber, 'paid');
await db.execute({ sql: "update orders set created_at = datetime('now', '-1 day') where order_number = ?", args: [before.orderNumber] });
check('a purchase from before this cart does not stop the reminder', (await dueEmails()).includes('ivy@example.com'), true);

const pending = await orders.create({ lines: [{ variantId: S, quantity: 1 }], method: 'standard', shipping: { ...shipping, email: 'ivy@example.com' } });
check('pressing pay without paying still counts as abandoned', (await dueEmails()).includes('ivy@example.com'), true);
await orders.setStatus(pending.orderNumber, 'paid');
check('paying, in any letter case, stops the reminder', (await dueEmails()).includes('ivy@example.com'), false);

// --- unsubscribing ---------------------------------------------------------------
const quiet = (await recovery.saveDraft({ email: 'quiet@example.com', lines: [{ variantId: S, quantity: 1 }] })) as string;
await age(quiet, '-3 hours');
check('due before opting out', (await dueEmails()).includes('quiet@example.com'), true);
check('unsubscribe works by token', await recovery.unsubscribe(quiet), true);
check('it is idempotent', await recovery.unsubscribe(quiet), true);
check('the address is suppressed', await recovery.isUnsubscribed('Quiet@Example.com'), true);
check('and never due again', (await dueEmails()).includes('quiet@example.com'), false);
check('an unknown token unsubscribes nobody', await recovery.unsubscribe('0'.repeat(48)), false);
check('a malformed token is refused', await recovery.unsubscribe("' or 1=1 --"), false);
await db.execute({ sql: 'delete from checkout_drafts where token = ?', args: [quiet] });
const back = (await recovery.saveDraft({ email: 'quiet@example.com', lines: [{ variantId: S, quantity: 1 }] })) as string;
await age(back, '-3 hours');
check('the opt-out outlives the draft it came from', (await dueEmails()).includes('quiet@example.com'), false);

// --- forgetting ------------------------------------------------------------------
const stale = (await recovery.saveDraft({ email: 'stale@example.com', lines: [{ variantId: S, quantity: 1 }] })) as string;
await age(stale, '-31 days');
const kept = (await recovery.saveDraft({ email: 'kept@example.com', lines: [{ variantId: S, quantity: 1 }] })) as string;
await age(kept, '-29 days');
check('purge deletes drafts older than 30 days', await recovery.purge(), 1);
check('the stale one is gone', await recovery.byToken(stale), null);
check('a younger one stays', (await recovery.byToken(kept))?.email, 'kept@example.com');

db.close();
await rm(dir, { recursive: true, force: true });
console.log(failures ? `\n${failures} failure(s)` : '\nAll recovery rules hold.');
process.exitCode = failures ? 1 : 0;
