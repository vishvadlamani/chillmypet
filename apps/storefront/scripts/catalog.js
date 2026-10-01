/**
 * Writes one product into the framework's generic schema.
 *
 * Shared by `seed.js`, which rebuilds a throwaway catalogue, and
 * `add-products.js`, which adds a product to a live store without touching the
 * ones already selling. One writer is what keeps the two from producing
 * differently shaped products.
 *
 * Option *values* are stable codes ('blue_camo'), not display text, so the
 * storefront can translate them through its language packs while the framework
 * and any agent still get a readable `label`.
 *
 * Variants are positional: `options[0]` is option1, `options[1]` option2 — the
 * same order the product's options are declared in.
 */

/**
 * @typedef {{ code: string, label: string, hex?: string }} OptionValue
 * @typedef {{
 *   slug: string,
 *   position?: number,
 *   translations: Record<string, { title: string, subtitle?: string, description?: string }>,
 *   options: { name: string, values: OptionValue[] }[],
 *   media: { url: string, alt: string, option?: string }[],
 *   variants: { sku: string, priceCents: number, compareAtCents?: number | null, stock: number, options: string[] }[],
 *   metafields?: { namespace: string, key: string, locale: string | null, value: unknown }[]
 * }} ProductDefinition
 */

/** How many order lines point at this product's variants. */
export async function orderLines(db, storeId, slug) {
	const result = await db.execute({
		sql: `select count(*) as count from order_items oi
		      join product_variants v on v.id = oi.variant_id
		      join products p on p.id = v.product_id
		      where p.store_id = ? and p.slug = ?`,
		args: [storeId, slug]
	});
	return Number(result.rows[0].count);
}

export async function productExists(db, storeId, slug) {
	const result = await db.execute({
		sql: 'select 1 from products where store_id = ? and slug = ?',
		args: [storeId, slug]
	});
	return result.rows.length > 0;
}

/**
 * Inserts the product and everything hanging off it, in one transaction — a
 * half-written product (options but no variants) renders as a page nobody can
 * buy from, which is worse than no page.
 *
 * @param {ProductDefinition} def
 */
export async function insertProduct(db, storeId, def) {
	const tx = await db.transaction('write');
	try {
		const product = await tx.execute({
			sql: `insert into products (store_id, slug, status, position) values (?, ?, 'active', ?)`,
			args: [storeId, def.slug, def.position ?? 0]
		});
		const productId = Number(product.lastInsertRowid);

		for (const [locale, t] of Object.entries(def.translations)) {
			await tx.execute({
				sql: `insert into product_translations
				        (store_id, product_id, locale, title, subtitle, description)
				      values (?, ?, ?, ?, ?, ?)`,
				args: [storeId, productId, locale, t.title, t.subtitle ?? null, t.description ?? null]
			});
		}

		// code -> option_value id, so media can name the value it illustrates.
		const valueIds = {};
		for (const [index, option] of def.options.entries()) {
			const row = await tx.execute({
				sql: `insert into product_options (store_id, product_id, name, position) values (?, ?, ?, ?)`,
				args: [storeId, productId, option.name, index]
			});
			const optionId = Number(row.lastInsertRowid);
			for (const [position, v] of option.values.entries()) {
				const value = await tx.execute({
					sql: `insert into product_option_values
					        (store_id, option_id, value, label, swatch_hex, position)
					      values (?, ?, ?, ?, ?, ?)`,
					args: [storeId, optionId, v.code, v.label, v.hex ?? null, position]
				});
				valueIds[v.code] = Number(value.lastInsertRowid);
			}
		}

		for (const [position, m] of def.media.entries()) {
			await tx.execute({
				sql: `insert into product_media (store_id, product_id, url, alt, position, option_value_id)
				      values (?, ?, ?, ?, ?, ?)`,
				args: [storeId, productId, m.url, m.alt, position, m.option ? valueIds[m.option] : null]
			});
		}

		for (const [position, v] of def.variants.entries()) {
			await tx.execute({
				sql: `insert into product_variants
				        (store_id, product_id, sku, price_cents, compare_at_cents, stock, position,
				         option1, option2, option3)
				      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					storeId,
					productId,
					v.sku,
					v.priceCents,
					v.compareAtCents ?? null,
					v.stock,
					position,
					v.options[0] ?? null,
					v.options[1] ?? null,
					v.options[2] ?? null
				]
			});
		}

		for (const m of def.metafields ?? []) {
			await tx.execute({
				sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
				      values (?, ?, ?, ?, ?, ?)`,
				args: [storeId, productId, m.namespace, m.key, m.locale, JSON.stringify(m.value)]
			});
		}

		await tx.commit();
		return { productId, variants: def.variants.length };
	} catch (err) {
		await tx.rollback();
		throw err;
	} finally {
		tx.close();
	}
}
