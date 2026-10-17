import { withBusyRetry, type Client } from '../db/index.ts';

/**
 * Abandoned-checkout recovery: the email a shopper typed at checkout, kept with
 * what was in the cart, so one reminder can go out if they leave without paying.
 *
 * A checkout only writes an order when the shopper presses pay, so someone who
 * types an email and closes the tab leaves nothing behind. A draft is that
 * missing row — and nothing more: it reserves no stock and is never an order.
 *
 * The rules that keep this from becoming spam live here rather than in the
 * host, so every storefront gets them:
 *
 * - One reminder per address per {@link REMIND_AGAIN_AFTER_DAYS}, however many
 *   carts that address starts. A draft remembers when it was reminded and a
 *   later cart on the same address keeps that date.
 * - Never to an address that bought after the draft was started, or that
 *   unsubscribed.
 * - {@link claim} is the only way to mark a draft reminded, and it succeeds once,
 *   so two sweeps running at the same moment cannot both send.
 * - Drafts are deleted after {@link KEEP_DAYS}: an email someone typed but
 *   never submitted is not kept indefinitely.
 */

export type CartLineRef = { variantId: number; quantity: number };

export type CheckoutDraft = {
	token: string;
	email: string;
	firstName: string | null;
	lines: CartLineRef[];
	locale: string;
	createdAt: string;
	updatedAt: string;
};

export type SaveDraftInput = {
	email: string;
	firstName?: string;
	lines: CartLineRef[];
	locale?: string;
};

export type DueOptions = {
	/** Minutes since the shopper last touched the checkout. Default 60. */
	idleMinutes?: number;
	/** Drafts older than this are not reminded at all. Default 48. */
	maxAgeHours?: number;
	limit?: number;
};

export interface RecoveryService {
	/**
	 * Creates or refreshes the draft for this address. Returns its token, or null
	 * when the email or the cart is not usable — callers should not tell the
	 * browser which, since the endpoint is public.
	 */
	saveDraft(input: SaveDraftInput): Promise<string | null>;
	byToken(token: string): Promise<CheckoutDraft | null>;
	/** Drafts whose reminder is due now, oldest first. Read-only: send only after {@link claim}. */
	due(opts?: DueOptions): Promise<CheckoutDraft[]>;
	/** Marks the draft reminded. True for exactly one caller. */
	claim(token: string): Promise<boolean>;
	/** Undoes a claim whose email could not be sent, so the next sweep retries it. */
	release(token: string): Promise<void>;
	/** Stops every future reminder to the draft's address. False for an unknown token. */
	unsubscribe(token: string): Promise<boolean>;
	isUnsubscribed(email: string): Promise<boolean>;
	/** Deletes drafts older than {@link KEEP_DAYS}. Returns how many went. */
	purge(): Promise<number>;
}

export const REMIND_AGAIN_AFTER_DAYS = 30;
export const KEEP_DAYS = 30;

const MAX_LINES = 20;
const MAX_QUANTITY = 10;
/** A shape check, not validation: the address is proven by the email arriving. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Statuses that mean money moved. `pending_payment` and `cancelled` are still abandoned. */
const BOUGHT = `('paid', 'fulfilled', 'refunded')`;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

function cleanLines(lines: unknown): CartLineRef[] {
	if (!Array.isArray(lines)) return [];
	const merged = new Map<number, number>();
	for (const line of lines.slice(0, MAX_LINES)) {
		const variantId = Number((line as CartLineRef)?.variantId);
		const quantity = Math.trunc(Number((line as CartLineRef)?.quantity));
		if (!Number.isInteger(variantId) || variantId <= 0) continue;
		if (!Number.isFinite(quantity) || quantity < 1) continue;
		merged.set(variantId, Math.min(MAX_QUANTITY, (merged.get(variantId) ?? 0) + quantity));
	}
	return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

function newToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toDraft(row: Record<string, unknown>): CheckoutDraft {
	let lines: CartLineRef[] = [];
	try {
		lines = cleanLines(JSON.parse(String(row.lines)));
	} catch {
		lines = [];
	}
	return {
		token: String(row.token),
		email: String(row.email),
		firstName: row.first_name === null ? null : String(row.first_name),
		lines,
		locale: String(row.locale),
		createdAt: String(row.created_at),
		updatedAt: String(row.updated_at)
	};
}

const COLUMNS = 'token, email, first_name, lines, locale, created_at, updated_at';
const TOKEN = /^[0-9a-f]{48}$/;

export function createRecoveryService(deps: {
	db: Client;
	storeId: string;
	defaultLocale: string;
}): RecoveryService {
	const { db, storeId, defaultLocale } = deps;

	async function isUnsubscribed(email: string): Promise<boolean> {
		const result = await db.execute({
			sql: 'select 1 from email_suppressions where store_id = ? and email = ?',
			args: [storeId, normalizeEmail(email)]
		});
		return result.rows.length > 0;
	}

	return {
		async saveDraft(input) {
			const email = normalizeEmail(String(input.email ?? '')).slice(0, 254);
			if (!EMAIL.test(email)) return null;
			const lines = cleanLines(input.lines);
			if (lines.length === 0) return null;
			const firstName = String(input.firstName ?? '').trim().slice(0, 80) || null;
			const locale = /^[a-z]{2}(-[A-Z]{2})?$/.test(input.locale ?? '') ? String(input.locale) : defaultLocale;

			return withBusyRetry(async () => {
				// One row per address. A new cart replaces the old one's contents and
				// restarts the idle clock, but keeps its token and its reminded_at, which
				// is what holds the one-reminder-per-address rule across carts.
				const result = await db.execute({
					sql: `insert into checkout_drafts (store_id, token, email, first_name, lines, locale)
					      values (?, ?, ?, ?, ?, ?)
					      on conflict (store_id, email) do update set
					        first_name = coalesce(excluded.first_name, checkout_drafts.first_name),
					        lines = excluded.lines,
					        locale = excluded.locale,
					        updated_at = datetime('now')
					      returning token`,
					args: [storeId, newToken(), email, firstName, JSON.stringify(lines), locale]
				});
				return result.rows[0] ? String(result.rows[0].token) : null;
			});
		},

		async byToken(token) {
			if (!TOKEN.test(token)) return null;
			const result = await db.execute({
				sql: `select ${COLUMNS} from checkout_drafts where store_id = ? and token = ?`,
				args: [storeId, token]
			});
			return result.rows[0] ? toDraft(result.rows[0] as Record<string, unknown>) : null;
		},

		async due(opts = {}) {
			const idle = Math.max(1, Math.trunc(opts.idleMinutes ?? 60));
			const maxAge = Math.max(1, Math.trunc(opts.maxAgeHours ?? 48));
			const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 20), 1), 100);
			const result = await db.execute({
				sql: `select ${COLUMNS} from checkout_drafts d
				      where d.store_id = ?
				        and d.updated_at <= datetime('now', ?)
				        and d.updated_at >= datetime('now', ?)
				        and (d.reminded_at is null or d.reminded_at <= datetime('now', ?))
				        and not exists (
				          select 1 from email_suppressions s
				          where s.store_id = d.store_id and s.email = d.email)
				        and not exists (
				          select 1 from orders o
				          where o.store_id = d.store_id
				            and lower(trim(o.email)) = d.email
				            and o.status in ${BOUGHT}
				            and o.created_at >= d.created_at)
				      order by d.updated_at asc, d.id asc
				      limit ?`,
				args: [
					storeId,
					`-${idle} minutes`,
					`-${maxAge} hours`,
					`-${REMIND_AGAIN_AFTER_DAYS} days`,
					limit
				]
			});
			return result.rows.map((r) => toDraft(r as Record<string, unknown>));
		},

		claim(token) {
			if (!TOKEN.test(token)) return Promise.resolve(false);
			return withBusyRetry(async () => {
				const result = await db.execute({
					sql: `update checkout_drafts set reminded_at = datetime('now')
					      where store_id = ? and token = ?
					        and (reminded_at is null or reminded_at <= datetime('now', ?))`,
					args: [storeId, token, `-${REMIND_AGAIN_AFTER_DAYS} days`]
				});
				return result.rowsAffected === 1;
			});
		},

		async release(token) {
			if (!TOKEN.test(token)) return;
			await withBusyRetry(() =>
				db.execute({
					sql: 'update checkout_drafts set reminded_at = null where store_id = ? and token = ?',
					args: [storeId, token]
				})
			);
		},

		async unsubscribe(token) {
			if (!TOKEN.test(token)) return false;
			return withBusyRetry(async () => {
				const found = await db.execute({
					sql: 'select email from checkout_drafts where store_id = ? and token = ?',
					args: [storeId, token]
				});
				const row = found.rows[0];
				if (!row) return false;
				await db.execute({
					sql: `insert into email_suppressions (store_id, email) values (?, ?)
					      on conflict (store_id, email) do nothing`,
					args: [storeId, String(row.email)]
				});
				return true;
			});
		},

		isUnsubscribed,

		purge() {
			return withBusyRetry(async () => {
				const result = await db.execute({
					sql: `delete from checkout_drafts where store_id = ? and updated_at < datetime('now', ?)`,
					args: [storeId, `-${KEEP_DAYS} days`]
				});
				return result.rowsAffected;
			});
		}
	};
}
