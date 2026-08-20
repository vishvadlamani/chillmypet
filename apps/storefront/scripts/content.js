/**
 * Product copy, in one place.
 *
 * Imported by both `seed.js`, which builds a catalogue from scratch, and
 * `sync-content.js`, which publishes copy changes to a store that already has
 * orders. Keeping it here is what stops the two drifting: a description edited
 * for the seed would otherwise never reach a live store, because the seed
 * refuses to run once an order references a variant.
 */

export const STORE = {
	id: process.env.SEED_STORE_ID ?? 'chillmypet',
	domain: process.env.SEED_STORE_DOMAIN ?? 'chillmypet.com',
	name: 'ChillMyPet',
	locale: 'en',
	currency: 'USD'
};


export const SLUG = 'dog-life-jacket';

/**
 * Sizing, in centimetres and kilograms — the storefront converts for display.
 *
 * Here rather than in `seed.js` because a live store needs it too: the product
 * page renders its size chart from this metafield, and the image it replaced
 * carried a competitor's measurements as well as their logo. A store that never
 * gets these rows shows no chart at all.
 */
export const SIZE_CHART = [
	{ size: 'XS', chestMinCm: 33, chestMaxCm: 43, weightMinKg: 2, weightMaxKg: 5 },
	{ size: 'S', chestMinCm: 43, chestMaxCm: 53, weightMinKg: 5, weightMaxKg: 9 },
	{ size: 'M', chestMinCm: 53, chestMaxCm: 64, weightMinKg: 9, weightMaxKg: 16 },
	{ size: 'L', chestMinCm: 64, chestMaxCm: 76, weightMinKg: 16, weightMaxKg: 27 },
	{ size: 'XL', chestMinCm: 76, chestMaxCm: 91, weightMinKg: 27, weightMaxKg: 45 }
];


export const TRANSLATIONS = {
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
};

// Short, scannable reasons to buy, shown under the price. Kept as content

// Short, scannable reasons to buy, shown under the price. Kept as content
// rather than markup so they translate and change without a deploy.
export const BENEFITS = {
	en: [
		['Keeps them level, not nose-down', 'Foam panels along the chest and flanks hold a swimming posture instead of tipping the head forward.'],
		['Lift them out in one motion', 'The reinforced top handle takes a dog\'s weight, so getting back onto a dock or boat is one movement.'],
		['Ready again tomorrow', 'Quick-dry fabric and rustproof hardware, built for back-to-back days in the water.'],
		['Seen in low light', 'Reflective trim on both flanks for early mornings, dusk swims and open water.']
	],
	es: [
		['Nivelado, sin hundir el hocico', 'Los paneles de espuma del pecho y los costados mantienen la postura de nado en vez de inclinar la cabeza.'],
		['Sácalo del agua de un tirón', 'El asa superior reforzada aguanta el peso del perro: volver al pantalán o a la barca es un solo movimiento.'],
		['Listo otra vez mañana', 'Tejido de secado rápido y herrajes inoxidables, pensados para días seguidos en el agua.'],
		['Visible con poca luz', 'Ribete reflectante en ambos costados para amaneceres, baños al atardecer y aguas abiertas.']
	]
};

export const EMAIL = 'contact@chillmypet.com';

export const FAQ = {
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
