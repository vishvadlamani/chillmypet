/**
 * Product copy, in one place.
 *
 * Imported by both `seed.js`, which builds a catalogue from scratch, and
 * `sync-content.js`, which publishes copy changes to a store that already has
 * orders. Keeping it here is what stops the two drifting: a description edited
 * for the seed would otherwise never reach a live store, because the seed
 * refuses to run once an order references a variant.
 *
 * `PRODUCTS` is a list, not a single product. It was a single product until the
 * Halloween costume landed, and every consumer of this file walked the one
 * export it had — so adding a second one meant looping in two scripts rather
 * than copying them. A third product is a new entry here and nothing else.
 */

export const STORE = {
	id: process.env.SEED_STORE_ID ?? 'chillmypet',
	domain: process.env.SEED_STORE_DOMAIN ?? 'chillmypet.com',
	name: 'ChillMyPet',
	locale: 'en',
	currency: 'USD'
};

export const EMAIL = 'contact@chillmypet.com';

/**
 * The shipping promise, quoted in every product's FAQ.
 *
 * One string because it is one policy, stated identically at
 * /policies/shipping. `$lib/store/season.ts` works the Halloween order-by date
 * back from THESE numbers — 2-4 business days plus 5-12 in transit — so if the
 * warehouse gets slower, change both together or the page promises a date
 * nobody can hit.
 */
const shippingAnswer = {
	en: `Please allow us 2-4 business days to process your order. Once processed, 93% of orders arrive between 5-12 days later. You may review our shipping policy for full details. If you have any questions, please contact us at ${EMAIL}.`,
	es: `Necesitamos entre 2 y 4 días laborables para preparar tu pedido. Una vez enviado, el 93% de los pedidos llega entre 5 y 12 días después. Puedes consultar nuestra política de envíos para más detalles. Si tienes cualquier duda, escríbenos a ${EMAIL}.`
};

const returnsAnswer = {
	en: `We offer 30 day - no questions asked - free exchanges and returns. You may review our return and exchange policy for full details. If you have any questions or would like to begin an exchange, please email us at ${EMAIL}.`,
	es: `Ofrecemos cambios y devoluciones gratuitos durante 30 días, sin preguntas. Puedes consultar nuestra política de devoluciones y cambios para más detalles. Si tienes dudas o quieres iniciar un cambio, escríbenos a ${EMAIL}.`
};

// ─────────────────────────────────────────────────────────────────────────────
// Dog life jacket
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sizing, from the MANUFACTURER'S table — the same factory jacket every store
 * shipping this product sells, so these are the numbers a dog gets fitted
 * against. Do not "tidy" them: the ranges overlap between sizes and the XL
 * spans 75–110 cm because that is what the supplier specifies, and a rounded
 * approximation is how a dog ends up in a jacket that rides up.
 *
 * Held in centimetres and kilograms; the storefront converts for display, and
 * `static/size-chart.svg` shows the full table including neck girth and back
 * length, which this shape doesn't carry.
 *
 * Here rather than in `seed.js` because a live store needs it too: the product
 * page renders its size chart from this metafield, and the image it replaced
 * carried a competitor's measurements as well as their logo. A store that never
 * gets these rows shows no chart at all.
 */
const LIFE_JACKET_SIZE_CHART = [
	{ size: 'XS', chestMinCm: 33, chestMaxCm: 45, weightMinKg: 0, weightMaxKg: 2.7 },
	{ size: 'S', chestMinCm: 43, chestMaxCm: 55, weightMinKg: 2.7, weightMaxKg: 5.9 },
	{ size: 'M', chestMinCm: 58, chestMaxCm: 70, weightMinKg: 5.9, weightMaxKg: 10.9 },
	{ size: 'L', chestMinCm: 67, chestMaxCm: 83, weightMinKg: 10.9, weightMaxKg: 25 },
	{ size: 'XL', chestMinCm: 75, chestMaxCm: 110, weightMinKg: 25, weightMaxKg: 40 }
];

const LIFE_JACKET_COLOURS = [
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

const LIFE_JACKET = {
	slug: 'dog-life-jacket',
	skuPrefix: 'CMP-LJ',
	priceCents: 4497,
	compareAtCents: 6397,
	colours: LIFE_JACKET_COLOURS,
	sizes: ['XS', 'S', 'M', 'L', 'XL'],
	// '-' means the combination is not offered at all; 0 means listed but empty.
	availability: {
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
	},
	// One photo per colour, so the gallery swaps with the swatch.
	photos: LIFE_JACKET_COLOURS.map(([code, label]) => ({
		url: `/products/dog-life-jacket/${code}.jpg`,
		alt: `Dog Life Jacket in ${label}`,
		colour: code
	})),
	sizeChart: LIFE_JACKET_SIZE_CHART,
	translations: {
		en: {
			title: 'Dog Life Jacket',
			subtitle: 'Let them be the adventurous one',
			description:
				'A buoyancy vest built for dogs who want to be in the water, not watching from the shore. Closed-cell foam panels sit along the chest and flanks to hold your dog level rather than nose-down, and a reinforced top handle lets you lift them onto a dock, boat or riverbank in one motion. Quick-dry fabric, adjustable chest and belly straps, and reflective trim for low light.'
		},
		es: {
			title: 'Chaleco salvavidas para perros',
			subtitle: 'Deja que sea el aventurero',
			description:
				'Un chaleco de flotación para perros que quieren estar en el agua, no mirando desde la orilla. Los paneles de espuma de célula cerrada del pecho y los costados mantienen a tu perro nivelado en lugar de hundir el hocico, y el asa superior reforzada permite subirlo a un pantalán, una barca o la orilla de un tirón. Tejido de secado rápido, cinchas ajustables de pecho y vientre, y ribete reflectante para poca luz.'
		}
	},
	// Short, scannable reasons to buy, shown under the price. Kept as content
	// rather than markup so they translate and change without a deploy.
	benefits: {
		en: [
			['Keeps them level, not nose-down', 'Foam panels along the chest and flanks hold a swimming posture instead of tipping the head forward.'],
			['Lift them out in one motion', "The reinforced top handle takes a dog's weight, so getting back onto a dock or boat is one movement."],
			['Ready again tomorrow', 'Quick-dry fabric and rustproof hardware, built for back-to-back days in the water.'],
			['Seen in low light', 'Reflective trim on both flanks for early mornings, dusk swims and open water.']
		],
		es: [
			['Nivelado, sin hundir el hocico', 'Los paneles de espuma del pecho y los costados mantienen la postura de nado en vez de inclinar la cabeza.'],
			['Sácalo del agua de un tirón', 'El asa superior reforzada aguanta el peso del perro: volver al pantalán o a la barca es un solo movimiento.'],
			['Listo otra vez mañana', 'Tejido de secado rápido y herrajes inoxidables, pensados para días seguidos en el agua.'],
			['Visible con poca luz', 'Ribete reflectante en ambos costados para amaneceres, baños al atardecer y aguas abiertas.']
		]
	},
	faq: {
		en: [
			['When will I get my order? 🚚', shippingAnswer.en],
			["What if the size doesn't fit my dog? 📏", returnsAnswer.en],
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
			['¿Cuándo recibiré mi pedido? 🚚', shippingAnswer.es],
			['¿Y si la talla no le queda bien a mi perro? 📏', returnsAnswer.es],
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
	}
};

// ─────────────────────────────────────────────────────────────────────────────
// Grim Reaper rider costume — the Halloween line
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sourced from the ad this page was built to answer: a saddle-style rider
 * costume, sold under a dozen brand names off the same factory mould.
 *
 * ⚠️ THERE IS NO SIZE CHART HERE ON PURPOSE. Every reseller of this costume
 * lists S/M/L and publishes no measurements at all — checked against four of
 * them. Inventing a chart is the exact mistake the life jacket already made
 * once with a competitor's numbers: someone measures their dog against a table
 * nobody stands behind, orders the size it names, and returns it at our cost.
 *
 * Paste the supplier's own table in here — same shape as
 * `LIFE_JACKET_SIZE_CHART` — and the chart section appears on the page by
 * itself, because every block that renders it declares `requires` on the rows.
 * Until then the page says how to measure and points at the free exchange,
 * which is true.
 */
const COSTUME_SIZE_CHART = [];

const COSTUME = {
	slug: 'grim-reaper-dog-costume',
	skuPrefix: 'CMP-GR',
	// $29.97 against $42.97 is 30% off, the same discount the announcement bar
	// derives for the jacket — one sitewide sale, not two that disagree. The
	// price point is where the resellers of this costume sit ($29.99).
	priceCents: 2997,
	compareAtCents: 4297,
	// One colourway, because the costume has one. The axis still exists: option
	// order is positional across the storefront (colour, then size) and a
	// product that skips it reads its sizes as colours.
	colours: [['black', 'Black', '#1b1a22']],
	sizes: ['S', 'M', 'L'],
	// ⚠️ Placeholder counts, not a supplier's. Real stock is what
	// `orders.create()` decrements to refuse an oversell, so set these from
	// whoever is actually shipping before this goes live.
	availability: {
		black: { S: 12, M: 12, L: 12 }
	},
	/**
	 * ⚠️ ONE DRAWING, AND IT IS NOT THE PRODUCT.
	 *
	 * No photography of this costume exists that is ours — the pictures out
	 * there belong to the reel and to the resellers' listings, and neither
	 * belongs on a page taking money. So the catalogue carries an illustration
	 * we drew instead: it says what the thing is without borrowing anyone's
	 * photo and without pretending to show the item that ships.
	 *
	 * Not attached to the colourway, so it stands in for the product rather
	 * than claiming to be what Black looks like. Replace it before spending on
	 * traffic; nobody buys apparel for a dog from a cartoon.
	 */
	photos: [
		{
			url: '/products/grim-reaper-dog-costume/placeholder.svg',
			alt: 'Illustration: a dog wearing the hooded rider costume under a full moon'
		}
	],
	sizeChart: COSTUME_SIZE_CHART,
	translations: {
		en: {
			title: 'Grim Reaper Rider Dog Costume',
			subtitle: 'POV: you took Halloween too seriously',
			description:
				'A hooded reaper who rides on your dog instead of walking beside them. The figure and its scythe sit on a saddle that straps over the shoulders, so it reads as a rider from the side — the angle every photo of it gets taken from — while your dog keeps all four legs free. Lightweight polyester, adjustable chest and belly straps, on and off in about ten seconds.'
		},
		es: {
			title: 'Disfraz de perro con jinete Segador',
			subtitle: 'POV: te tomaste Halloween demasiado en serio',
			description:
				'Un segador encapuchado que va montado en tu perro en vez de andar a su lado. La figura y su guadaña se sujetan a una montura que se ciñe sobre los hombros, así que de perfil parece un jinete —el ángulo desde el que se hacen todas las fotos— mientras tu perro mantiene las cuatro patas libres. Poliéster ligero, cinchas ajustables de pecho y vientre, y se pone y se quita en unos diez segundos.'
		}
	},
	benefits: {
		en: [
			['The rider does the work', 'The reaper and scythe stand up off the back, so it reads from the side at a glance instead of needing a caption.'],
			['All four legs stay free', 'It is a saddle, not a bodysuit — nothing goes over the paws, so they can still walk, sit and beg in it.'],
			['On in about ten seconds', 'Two adjustable straps under the chest and belly. Nothing to step into, nothing over the head.'],
			['Fits cats too', 'The same saddle sits over the shoulders on a cat, which is where most of the funniest photos come from.']
		],
		es: [
			['El jinete hace el trabajo', 'El segador y la guadaña sobresalen del lomo, así que de perfil se entiende a la primera sin necesidad de explicarlo.'],
			['Las cuatro patas libres', 'Es una montura, no un mono: nada pasa por las patas, así que puede andar, sentarse y pedir con él puesto.'],
			['Puesto en diez segundos', 'Dos cinchas ajustables bajo el pecho y la barriga. Nada donde meter las patas, nada por la cabeza.'],
			['También vale para gatos', 'La misma montura se apoya sobre los hombros de un gato, que es de donde salen las mejores fotos.']
		]
	},
	faq: {
		en: [
			['Will it arrive before Halloween? 🎃',
			 'If you order by the date shown at the top of this page, yes — that date is worked back from our real processing and delivery times, not rounded up to look better. Order after it and we cannot promise October 31, so we would rather you knew now.'],
			['When will I get my order? 🚚', shippingAnswer.en],
			['Can my dog actually walk in it?',
			 'Yes. The costume is a saddle that sits on the back and straps under the chest and belly — nothing covers the legs or the paws, so their gait is unchanged. Most dogs ignore it after the first minute.'],
			['How do I pick a size?',
			 'Measure your dog\'s chest at its widest point, just behind the front legs, and pick the size that range falls in. The straps adjust either way from there. If your dog is between sizes, size up — and if you are not sure, email us the measurement and we will tell you which one to order.'],
			['Will it stay on?',
			 'The straps are adjustable and should be snug enough that two fingers fit underneath and no more. It is made for photos, a party or a walk around the block — not for being left on unsupervised.'],
			['Does it work on a cat?',
			 'It does. The saddle sits over the shoulders the same way. Cats have less patience for it than dogs, so start with a short session.'],
			["What if it doesn't fit? 📏", returnsAnswer.en]
		],
		es: [
			['¿Llegará antes de Halloween? 🎃',
			 'Si haces el pedido antes de la fecha que aparece arriba, sí: esa fecha sale de nuestros plazos reales de preparación y entrega, sin redondear para que quede bonita. Si pides después, no podemos prometerte el 31 de octubre, y preferimos decírtelo ahora.'],
			['¿Cuándo recibiré mi pedido? 🚚', shippingAnswer.es],
			['¿Mi perro puede andar con él puesto?',
			 'Sí. El disfraz es una montura que se apoya en el lomo y se ciñe bajo el pecho y la barriga: nada cubre las patas, así que camina igual. La mayoría de los perros se olvida de él al minuto.'],
			['¿Cómo elijo la talla?',
			 'Mide el contorno del pecho de tu perro en su punto más ancho, justo detrás de las patas delanteras, y elige la talla en cuyo rango caiga. Las cinchas ajustan desde ahí. Si está entre dos tallas, elige la mayor; y si tienes dudas, escríbenos la medida y te decimos cuál pedir.'],
			['¿Se queda puesto?',
			 'Las cinchas son ajustables y deben quedar de modo que quepan dos dedos por debajo, no más. Está pensado para fotos, una fiesta o un paseo por el barrio, no para dejarlo puesto sin vigilancia.'],
			['¿Sirve para un gato?',
			 'Sí. La montura se apoya sobre los hombros igual. Los gatos lo aguantan menos que los perros, así que empieza con ratos cortos.'],
			['¿Y si no le queda bien? 📏', returnsAnswer.es]
		]
	}
};

/**
 * Every product this store sells, in the order the storefront lists them.
 *
 * `seed.js` and `sync-content.js` both walk this; nothing else should need to
 * know how many there are.
 */
export const PRODUCTS = [LIFE_JACKET, COSTUME];
