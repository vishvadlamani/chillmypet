import { withBusyRetry, schemaStatements, type Client } from '../db/index.ts';
import { REVIEWS_SCHEMA } from '../db/schema.ts';

export type Review = {
	id: number;
	productSlug: string;
	author: string;
	rating: number;
	body: string;
	status: 'pending' | 'published' | 'hidden';
	createdAt: string;
};

export interface ReviewService {
	submit(input: { productSlug: string; author: string; rating: number; body: string }): Promise<boolean>;
	publicFor(productSlug: string): Promise<{ reviews: Review[]; count: number; average: number }>;
	list(status: Review['status']): Promise<Review[]>;
	moderate(id: number, status: Review['status']): Promise<boolean>;
}

// The live catalogue migration runs in the background. Await this additive
// migration before reading reviews so the first visitor after deployment works.
const initialized = new WeakMap<Client, Promise<unknown>>();
export function createReviewService({ db, storeId }: { db: Client; storeId: string }): ReviewService {
	function ready() {
		let pending = initialized.get(db);
		if (!pending) {
			pending = withBusyRetry(() => db.batch(schemaStatements(REVIEWS_SCHEMA), 'write'))
				.catch((error) => { initialized.delete(db); throw error; });
			initialized.set(db, pending);
		}
		return pending;
	}
	const toReview = (row: Record<string, unknown>): Review => ({
		id: Number(row.id), productSlug: String(row.product_slug), author: String(row.author),
		rating: Number(row.rating), body: String(row.body), status: row.status as Review['status'],
		createdAt: String(row.created_at)
	});
	const select = `select r.*, p.slug as product_slug from product_reviews r
		join products p on p.id = r.product_id and p.store_id = r.store_id`;
	return {
		async submit(input) {
			const author = input.author.trim();
			const body = input.body.trim();
			if (author.length < 2 || author.length > 80 || body.length < 10 || body.length > 3000 ||
				!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) return false;
			await ready();
			const result = await withBusyRetry(() => db.execute({
				sql: `insert into product_reviews (store_id, product_id, author, rating, body)
					select ?, id, ?, ?, ? from products where store_id = ? and slug = ? and status = 'active'`,
				args: [storeId, author, input.rating, body, storeId, input.productSlug]
			}));
			return result.rowsAffected > 0;
		},
		async publicFor(productSlug) {
			await ready();
			const [rows, summary] = await Promise.all([
				db.execute({ sql: `${select} where r.store_id = ? and p.slug = ? and r.status = 'published'
					order by r.created_at desc, r.id desc limit 50`, args: [storeId, productSlug] }),
				db.execute({ sql: `select count(*) as count, avg(r.rating) as average from product_reviews r
					join products p on p.id = r.product_id and p.store_id = r.store_id
					where r.store_id = ? and p.slug = ? and r.status = 'published'`, args: [storeId, productSlug] })
			]);
			return { reviews: rows.rows.map(toReview), count: Number(summary.rows[0].count),
				average: Number(summary.rows[0].average ?? 0) };
		},
		async list(status) {
			await ready();
			const result = await db.execute({ sql: `${select} where r.store_id = ? and r.status = ?
				order by r.created_at desc, r.id desc limit 200`, args: [storeId, status] });
			return result.rows.map(toReview);
		},
		async moderate(id, status) {
			if (!Number.isSafeInteger(id) || id < 1 || !['pending', 'published', 'hidden'].includes(status)) return false;
			await ready();
			const result = await withBusyRetry(() => db.execute({
				sql: 'update product_reviews set status = ? where store_id = ? and id = ?', args: [status, storeId, id]
			}));
			return result.rowsAffected > 0;
		}
	};
}
