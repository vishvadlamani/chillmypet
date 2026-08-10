/**
 * Seeds this store into the framework's generic schema.
 *
 * Option *values* are stable codes ('blue_camo'), not display text, so the
 * storefront can translate them through its language packs while the framework
 * and any agent still get a readable `label`.
 */
import { createDb, createStoreService } from 'ecomwithai';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const db = createDb(authToken ? { url, authToken } : { url });

const STORE = {
	id: process.env.SEED_STORE_ID ?? 'chillmypet',
	domain: process.env.SEED_STORE_DOMAIN ?? 'chillmypet.com',
	name: 'ChillMyPet',
	locale: 'en',
	currency: 'USD'
};

// Public identifiers — both appear in the served page source.
const SETTINGS = {
	meta_pixel_id: '28272021345717397',
	meta_domain_verification: '0d821f82wjdsr4q7owd17wo659qt6h'
};

const SLUG = 'dog-life-jacket';
const PRICE_CENTS = 4497;
const COMPARE_AT_CENTS = 6397;

const COLOURS = [
	['sailboat', 'Sailboat', '#1e4e8c'],
	['blue_camo', 'Blue Camo', '#4a6fa5'],
	['green', 'Green', '#3f7d53'],
	['pink_camo', 'Pink Camo', '#c98ba8'],
	['floral', 'Floral', '#d96b8a'],
	['yellow', 'Yellow', '#e8b838'],
	['blue', 'Blue', '#2d7dd2'],
	['pink', 'Pink', '#e86aa0'],
	['purple', 'Purple', '#7b5ea7'],
	['red', 'Red', '#c63b3b']
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL'];

// '-' means the combination is not offered at all; 0 means listed but empty.
const AVAILABILITY = {
	sailboat: { XS: 0, S: 12, M: 0, L: 12, XL: '-' },
	blue_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	green: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	pink_camo: { XS: 12, S: 12, M: 12, L: 12, XL: 12 },
	floral: { XS: 12, S: 12, M: 12, L: 12, XL: '-' },
	yellow: { XS: 0, S: 0, M: 0, L: 0, XL: 12 },
	blue: { XS: 12, S: 12, M: 12, L: 0, XL: 0 },
	pink: { XS: 0, S: 12, M: 0, L: 0, XL: 12 },
	purple: { XS: 0, S: 0, M: 0, L: 0, XL: '-' },
	red: { XS: 12, S: 12, M: 0, L: 0, XL: 12 }
};

const SIZE_CHART = [
	{ size: 'XS', chestMinCm: 33, chestMaxCm: 43, weightMinKg: 2, weightMaxKg: 5 },
	{ size: 'S', chestMinCm: 43, chestMaxCm: 53, weightMinKg: 5, weightMaxKg: 9 },
	{ size: 'M', chestMinCm: 53, chestMaxCm: 64, weightMinKg: 9, weightMaxKg: 16 },
	{ size: 'L', chestMinCm: 64, chestMaxCm: 76, weightMinKg: 16, weightMaxKg: 27 },
	{ size: 'XL', chestMinCm: 76, chestMaxCm: 91, weightMinKg: 27, weightMaxKg: 45 }
];

const TRANSLATIONS = {
	en: {
		title: 'Dog Life Jacket',
		subtitle: 'Let them be the adventurous one',
		description:
			"If the size you chose isn't quite right, we offer a 30 day - no questions asked - free exchange or return policy. If your dog is between sizes, we recommend sizing up for a more comfortable, secure fit."
	},
	es: {
		title: 'Chaleco salvavidas para perros',
		subtitle: 'Deja que sea el aventurero',
		description:
			'Si la talla que elegiste no es la adecuada, ofrecemos cambios y devoluciones gratuitos durante 30 días, sin preguntas. Si tu perro está entre dos tallas, recomendamos elegir la mayor para un ajuste más cómodo y seguro.'
	}
};

const EMAIL = 'contact@chillmypet.com';

const FAQ = {
	en: [
		['When will I get my order? 🚚',
		 `Please allow us 2-4 business days to process your order. Once processed, 93% of orders arrive between 5-12 days later. You may review our shipping policy for full details. If you have any questions, please contact us at ${EMAIL}.`],
		["What if the size doesn't fit my dog? 📏",
		 `We offer 30 day - no questions asked - free exchanges and returns. You may review our return and exchange policy for full details. If you have any questions or would like to begin an exchange, please email us at ${EMAIL}.`],
		['Is the chin rest comfortable for smaller dogs?',
		 "Yes - the chin rest is designed to sit naturally under the jaw without restricting movement, and it's proportioned across all sizes so smaller breeds get the same support as larger ones."],
		["Will this work for a dog who's never worn a life vest before?",
		 'Most dogs adjust within the first few minutes, especially once they’re in the water and feel the support. We recommend a quick 5-minute trial in shallow water before a big trip.'],
		['Can it get wet and dry quickly between uses?',
		 'Absolutely - the materials are quick-dry and built for repeated water use, so you can use it one day and have it ready again the next.'],
		['How do I know which size to order?',
		 'Check our size chart based on chest girth and weight. If your dog is between sizes, we recommend sizing up for a more comfortable, secure fit.'],
		['Is the handle strong enough to lift my dog out of water?',
		 'Yes - the handle is reinforced and stitched to support a quick lift-assist, ideal for getting your dog back onto a dock, boat, or shore.'],
		["What if the size doesn't fit right when it arrives?",
		 "No problem - reach out to our team and we'll help you exchange for the correct size, hassle-free."]
	],
	es: [
		['¿Cuándo recibiré mi pedido? 🚚',
		 `Necesitamos entre 2 y 4 días laborables para preparar tu pedido. Una vez enviado, el 93% de los pedidos llega entre 5 y 12 días después. Puedes consultar nuestra política de envíos para más detalles. Si tienes cualquier duda, escríbenos a ${EMAIL}.`],
		['¿Y si la talla no le queda bien a mi perro? 📏',
		 `Ofrecemos cambios y devoluciones gratuitos durante 30 días, sin preguntas. Puedes consultar nuestra política de devoluciones y cambios para más detalles. Si tienes dudas o quieres iniciar un cambio, escríbenos a ${EMAIL}.`],
		['¿El apoyo de barbilla es cómodo para perros pequeños?',
		 'Sí: el apoyo de barbilla está diseñado para quedar de forma natural bajo la mandíbula sin limitar el movimiento, y está proporcionado en todas las tallas, así que las razas pequeñas reciben el mismo soporte que las grandes.'],
		['¿Sirve para un perro que nunca ha llevado chaleco salvavidas?',
		 'La mayoría de los perros se adapta en los primeros minutos, sobre todo cuando están en el agua y notan el soporte. Recomendamos una prueba de 5 minutos en agua poco profunda antes de una salida larga.'],
		['¿Se puede mojar y secar rápido entre usos?',
		 'Por supuesto: los materiales son de secado rápido y están hechos para un uso repetido en el agua, así que puedes usarlo un día y tenerlo listo al siguiente.'],
		['¿Cómo sé qué talla pedir?',
		 'Consulta nuestra guía de tallas según el contorno de pecho y el peso. Si tu perro está entre dos tallas, recomendamos elegir la mayor para un ajuste más cómodo y seguro.'],
		['¿El asa aguanta para sacar a mi perro del agua?',
		 'Sí: el asa está reforzada y cosida para permitir una elevación rápida, ideal para subir a tu perro a un muelle, una barca o la orilla.'],
		['¿Y si al llegar la talla no es la correcta?',
		 'Sin problema: escríbenos y te ayudamos a cambiarla por la talla correcta, sin complicaciones.']
	]
};

// --- store ---
await db.execute({
	sql: `insert into stores (id, domain, name, default_locale, currency)
	      values (?, ?, ?, ?, ?)
	      on conflict (id) do update set
	        domain = excluded.domain, name = excluded.name,
	        default_locale = excluded.default_locale, currency = excluded.currency`,
	args: [STORE.id, STORE.domain, STORE.name, STORE.locale, STORE.currency]
});

const stores = createStoreService(db);
for (const [key, value] of Object.entries(SETTINGS)) {
	await stores.setSetting(STORE.id, key, value);
}

// --- product ---
// Deleting the product cascades to its variants, and `order_items.variant_id`
// has no ON DELETE action, so an order referencing one blocks the whole seed.
// That refusal is the schema protecting order history — but it surfaces as a
// bare SQLITE_CONSTRAINT_FOREIGNKEY stack trace, so say what actually happened.
const referenced = await db.execute({
	sql: `select count(*) as count from order_items oi
	      join product_variants v on v.id = oi.variant_id
	      join products p on p.id = v.product_id
	      where p.store_id = ? and p.slug = ?`,
	args: [STORE.id, SLUG]
});
if (Number(referenced.rows[0].count) > 0) {
	console.error(
		`Refusing to reseed: ${referenced.rows[0].count} order line(s) reference ` +
			`variants of "${SLUG}" in ${url}.\n` +
			`Seeding recreates the product, which would orphan them.\n` +
			`On a throwaway database, delete the file and reseed. Against a real ` +
			`one, migrate the catalogue instead — those are customer orders.`
	);
	process.exit(1);
}

await db.execute({
	sql: 'delete from products where store_id = ? and slug = ?',
	args: [STORE.id, SLUG]
});

const product = await db.execute({
	sql: `insert into products (store_id, slug, status) values (?, ?, 'active')`,
	args: [STORE.id, SLUG]
});
const productId = Number(product.lastInsertRowid);

for (const [locale, t] of Object.entries(TRANSLATIONS)) {
	await db.execute({
		sql: `insert into product_translations
		        (store_id, product_id, locale, title, subtitle, description)
		      values (?, ?, ?, ?, ?, ?)`,
		args: [STORE.id, productId, locale, t.title, t.subtitle, t.description]
	});
}

// --- options ---
const optionIds = {};
for (const [index, name] of ['Color', 'Size'].entries()) {
	const row = await db.execute({
		sql: `insert into product_options (store_id, product_id, name, position) values (?, ?, ?, ?)`,
		args: [STORE.id, productId, name, index]
	});
	optionIds[name] = Number(row.lastInsertRowid);
}

const colourValueIds = {};
for (const [index, [code, label, hex]] of COLOURS.entries()) {
	const row = await db.execute({
		sql: `insert into product_option_values
		        (store_id, option_id, value, label, swatch_hex, position)
		      values (?, ?, ?, ?, ?, ?)`,
		args: [STORE.id, optionIds.Color, code, label, hex, index]
	});
	colourValueIds[code] = Number(row.lastInsertRowid);
}

for (const [index, size] of SIZES.entries()) {
	await db.execute({
		sql: `insert into product_option_values (store_id, option_id, value, label, position)
		      values (?, ?, ?, ?, ?)`,
		args: [STORE.id, optionIds.Size, size, size, index]
	});
}

// --- media, one photo per colour ---
for (const [index, [code, label]] of COLOURS.entries()) {
	await db.execute({
		sql: `insert into product_media (store_id, product_id, url, alt, position, option_value_id)
		      values (?, ?, ?, ?, ?, ?)`,
		args: [
			STORE.id,
			productId,
			`/products/${SLUG}/${code}.jpg`,
			`${TRANSLATIONS.en.title} in ${label}`,
			index,
			colourValueIds[code]
		]
	});
}

// --- variants ---
let variants = 0;
let skipped = 0;
for (const [code] of COLOURS) {
	for (const size of SIZES) {
		const stock = AVAILABILITY[code][size];
		if (stock === '-') {
			skipped += 1;
			continue;
		}
		await db.execute({
			sql: `insert into product_variants
			        (store_id, product_id, sku, price_cents, compare_at_cents, stock, position, option1, option2)
			      values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				STORE.id,
				productId,
				`CMP-LJ-${code.toUpperCase()}-${size}`,
				PRICE_CENTS,
				COMPARE_AT_CENTS,
				stock,
				variants,
				code,
				size
			]
		});
		variants += 1;
	}
}

// --- metafields: structured content the core does not model ---
await db.execute({
	sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
	      values (?, ?, 'specs', 'size_chart', null, ?)`,
	args: [STORE.id, productId, JSON.stringify(SIZE_CHART)]
});

for (const [locale, entries] of Object.entries(FAQ)) {
	await db.execute({
		sql: `insert into product_metafields (store_id, product_id, namespace, key, locale, value_json)
		      values (?, ?, 'content', 'faq', ?, ?)`,
		args: [
			STORE.id,
			productId,
			locale,
			JSON.stringify(entries.map(([q, a]) => ({ q, a })))
		]
	});
}

console.log(
	`Seeded "${STORE.id}" (${STORE.domain}): ${SLUG} with ${COLOURS.length} colours, ` +
		`${SIZES.length} sizes, ${variants} variants (${skipped} not offered), ` +
		`${Object.keys(TRANSLATIONS).length} locales`
);
db.close();
