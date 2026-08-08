import type { Client } from '../db/index.ts';

export type Store = {
	id: string;
	domain: string;
	name: string;
	defaultLocale: string;
	currency: string;
	metaPixelId: string | null;
	metaDomainVerification: string | null;
};

/**
 * Resolving a request to a tenant. Kept behind an interface like every other
 * module so it can move to its own Worker (or a KV-backed cache) later.
 */
export interface StoreService {
	byDomain(domain: string): Promise<Store | null>;
	byId(id: string): Promise<Store | null>;
	list(): Promise<Store[]>;
}

function toStore(row: Record<string, unknown>): Store {
	return {
		id: String(row.id),
		domain: String(row.domain),
		name: String(row.name),
		defaultLocale: String(row.default_locale),
		currency: String(row.currency),
		metaPixelId: row.meta_pixel_id === null ? null : String(row.meta_pixel_id),
		metaDomainVerification:
			row.meta_domain_verification === null ? null : String(row.meta_domain_verification)
	};
}

const SELECT = `select id, domain, name, default_locale, currency,
                       meta_pixel_id, meta_domain_verification
                from stores where active = 1`;

export function createStoreService(db: Client): StoreService {
	return {
		async byDomain(domain) {
			// Host headers carry a port in development; the stored domain never does.
			const host = domain.toLowerCase().split(':')[0];
			const result = await db.execute({
				sql: `${SELECT} and domain = ?`,
				args: [host]
			});
			const row = result.rows[0];
			return row ? toStore(row as Record<string, unknown>) : null;
		},

		async byId(id) {
			const result = await db.execute({ sql: `${SELECT} and id = ?`, args: [id] });
			const row = result.rows[0];
			return row ? toStore(row as Record<string, unknown>) : null;
		},

		async list() {
			const result = await db.execute(`${SELECT} order by id`);
			return result.rows.map((r) => toStore(r as Record<string, unknown>));
		}
	};
}
