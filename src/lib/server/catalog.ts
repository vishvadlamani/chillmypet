import { db } from './db';

export type Colour = { code: string; hex: string };
export type Variant = { id: number; colour: string; size: string; sku: string; stock: number };
export type SizeRow = {
	size: string;
	chestMinCm: number;
	chestMaxCm: number;
	weightMinKg: number;
	weightMaxKg: number;
};

export type Product = {
	id: number;
	slug: string;
	priceCents: number;
	compareAtCents: number | null;
	currency: string;
	colours: Colour[];
	variants: Variant[];
	sizeChart: SizeRow[];
};

export async function getProduct(slug: string): Promise<Product | null> {
	const client = db();

	const productRows = await client.execute({
		sql: `select id, slug, price_cents, compare_at_cents, currency
		      from products where slug = ? and active = 1`,
		args: [slug]
	});

	const row = productRows.rows[0];
	if (!row) return null;

	const id = Number(row.id);

	const [colours, variants, sizes] = await Promise.all([
		client.execute({
			sql: `select code, hex from product_colours where product_id = ? order by position, id`,
			args: [id]
		}),
		client.execute({
			sql: `select id, colour, size, sku, stock from product_variants
			      where product_id = ? order by colour, id`,
			args: [id]
		}),
		client.execute({
			sql: `select size, chest_min_cm, chest_max_cm, weight_min_kg, weight_max_kg
			      from size_chart where product_id = ? order by position, id`,
			args: [id]
		})
	]);

	return {
		id,
		slug: String(row.slug),
		priceCents: Number(row.price_cents),
		compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
		currency: String(row.currency),
		colours: colours.rows.map((c) => ({ code: String(c.code), hex: String(c.hex) })),
		variants: variants.rows.map((v) => ({
			id: Number(v.id),
			colour: String(v.colour),
			size: String(v.size),
			sku: String(v.sku),
			stock: Number(v.stock)
		})),
		sizeChart: sizes.rows.map((s) => ({
			size: String(s.size),
			chestMinCm: Number(s.chest_min_cm),
			chestMaxCm: Number(s.chest_max_cm),
			weightMinKg: Number(s.weight_min_kg),
			weightMaxKg: Number(s.weight_max_kg)
		}))
	};
}

export type PricedVariant = {
	variantId: number;
	productSlug: string;
	colour: string;
	size: string;
	sku: string;
	unitPriceCents: number;
	currency: string;
	stock: number;
};

/**
 * Resolves cart line items to server-side prices. The browser only ever sends
 * variant ids and quantities — prices are never trusted from the client.
 */
export async function priceVariants(variantIds: number[]): Promise<Map<number, PricedVariant>> {
	const unique = [...new Set(variantIds)].filter((id) => Number.isInteger(id) && id > 0);
	if (unique.length === 0) return new Map();

	const placeholders = unique.map(() => '?').join(', ');
	const result = await db().execute({
		sql: `select v.id, v.colour, v.size, v.sku, v.stock,
		             p.slug, p.price_cents, p.currency
		      from product_variants v
		      join products p on p.id = v.product_id
		      where v.id in (${placeholders}) and p.active = 1`,
		args: unique
	});

	return new Map(
		result.rows.map((r) => [
			Number(r.id),
			{
				variantId: Number(r.id),
				productSlug: String(r.slug),
				colour: String(r.colour),
				size: String(r.size),
				sku: String(r.sku),
				unitPriceCents: Number(r.price_cents),
				currency: String(r.currency),
				stock: Number(r.stock)
			}
		])
	);
}
