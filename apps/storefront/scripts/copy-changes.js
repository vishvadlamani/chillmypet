/**
 * Copy changes a live store has to pick up: a product's title, subtitle or
 * description, per locale.
 *
 * The same reason as `price-changes.js`: `products.js` only adds products, so
 * editing a product's script changes a fresh seed and nothing else. A change
 * listed here is applied by the Worker's catalogue sync and by
 * `npm run db:products`, and only where the field still reads `from`
 * exactly: it runs once, and copy edited by hand since is left alone. Placed
 * orders keep the title they were placed under (`order_items`).
 *
 * Keep entries after they have run, and change the product's script in the
 * same commit. Imported by the Worker: no `process`, filesystem or network.
 */
import { CHRISTMAS_HOODIE } from './christmas-hoodie.js';
import { CHRISTMAS_TREE_COSTUME } from './christmas-tree-costume.js';
import { SANTA_COSTUME } from './santa-costume-with-gift.js';

const costume = CHRISTMAS_TREE_COSTUME.translations.en;
const hoodie = CHRISTMAS_HOODIE.translations.en;
const santa = SANTA_COSTUME.translations.en;

/** @type {{ slug: string, locale: string, field: 'title' | 'subtitle' | 'description', from: string, to: string }[]} */
export const COPY_CHANGES = [
	// "Pet", not "Dog" (owner's call, 2026-10-17): small dogs and cats.
	{
		slug: 'christmas-tree-costume',
		locale: 'en',
		field: 'title',
		from: 'Dog Christmas Tree Costume',
		to: costume.title
	},
	{
		slug: 'christmas-tree-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your dog into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	},
	// "Pet", never "dog" or "cat", in a name or a description (the owner's
	// call, 2026-10-18). Slugs are renamed first (`slug-changes.js`), so these
	// find the rows under their new slugs.
	{
		slug: 'christmas-tree-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your dog or cat into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	},
	{
		slug: 'christmas-hoodie',
		locale: 'en',
		field: 'title',
		from: 'Reindeer Christmas Dog Hoodie',
		to: hoodie.title
	},
	{
		slug: 'christmas-hoodie',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush hoodie that turns your dog into one of Santa’s reindeer. Brown antlers on the hood, fluffy white trim, white snap buttons down the front and a Christmas tree patch on the back. For small dogs, sizes S to XL.',
		to: hoodie.description ?? ''
	},
	{
		slug: 'santa-costume-with-gift',
		locale: 'en',
		field: 'title',
		from: 'Santa Pet Costume with Gift',
		to: santa.title
	},
	{
		slug: 'santa-costume-with-gift',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush Santa suit with white fur trim and a black belt, and two little plush arms out front holding a wrapped present, so your pet looks like Santa making a delivery. Comes with a matching Santa hat. For small dogs and cats, sizes S to L.',
		to: santa.description ?? ''
	},
	// No "pet", "dog" or "cat" in anything a shopper reads (the owner's call,
	// 2026-10-18, the same evening). Renames run first, so these name the
	// newest slugs. The life jacket's copy is written out, not imported:
	// `content.js` reads `process.env`, and the Worker imports this file. Keep
	// it equal to `TRANSLATIONS` there.
	{
		slug: 'christmas-tree-costume',
		locale: 'en',
		field: 'title',
		from: 'Pet Christmas Tree Costume',
		to: costume.title
	},
	{
		slug: 'christmas-tree-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your pet into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small pets, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	},
	{
		slug: 'christmas-hoodie',
		locale: 'en',
		field: 'title',
		from: 'Christmas Pet Hoodie',
		to: hoodie.title
	},
	{
		slug: 'christmas-hoodie',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush hoodie that turns your pet into one of Santa’s reindeer. Brown antlers on the hood, fluffy white trim, white snap buttons down the front and a Christmas tree patch on the back. For small pets, sizes S to XL.',
		to: hoodie.description ?? ''
	},
	{
		slug: 'santa-costume-with-gift',
		locale: 'en',
		field: 'title',
		from: 'Pet Santa Costume with Gift',
		to: santa.title
	},
	{
		slug: 'santa-costume-with-gift',
		locale: 'en',
		field: 'subtitle',
		from: 'Your pet, delivering the presents',
		to: santa.subtitle ?? ''
	},
	{
		slug: 'santa-costume-with-gift',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush Santa suit with white fur trim and a black belt, and two little plush arms out front holding a wrapped present, so your pet looks like Santa making a delivery. Comes with a matching Santa hat. For small pets, sizes S to L.',
		to: santa.description ?? ''
	},
	{
		slug: 'life-jacket',
		locale: 'en',
		field: 'title',
		from: 'Dog Life Jacket',
		to: 'Life Jacket'
	},
	{
		slug: 'life-jacket',
		locale: 'en',
		field: 'description',
		from: 'A buoyancy vest built for dogs who want to be in the water, not watching from the shore. Closed-cell foam panels sit along the chest and flanks to hold your dog level rather than nose-down, and a reinforced top handle lets you lift them onto a dock, boat or riverbank in one motion. Quick-dry fabric, adjustable chest and belly straps, and reflective trim for low light.',
		to: 'A buoyancy vest for the ones who want to be in the water, not watching from the shore. Closed-cell foam panels sit along the chest and flanks to hold them level rather than nose-down, and a reinforced top handle lets you lift them onto a dock, boat or riverbank in one motion. Quick-dry fabric, adjustable chest and belly straps, and reflective trim for low light.'
	},
	{
		slug: 'life-jacket',
		locale: 'es',
		field: 'title',
		from: 'Chaleco salvavidas para perros',
		to: 'Chaleco salvavidas'
	},
	{
		slug: 'life-jacket',
		locale: 'es',
		field: 'description',
		from: 'Un chaleco de flotación para perros que quieren estar en el agua, no mirando desde la orilla. Los paneles de espuma de célula cerrada del pecho y los costados mantienen a tu perro nivelado en lugar de hundir el hocico, y el asa superior reforzada permite subirlo a un pantalán, una barca o la orilla de un tirón. Tejido de secado rápido, cinchas ajustables de pecho y vientre, y ribete reflectante para poca luz.',
		to: 'Un chaleco de flotación para quienes quieren estar en el agua, no mirando desde la orilla. Los paneles de espuma de célula cerrada del pecho y los costados lo mantienen nivelado en lugar de hundir el hocico, y el asa superior reforzada permite subirlo a un pantalán, una barca o la orilla de un tirón. Tejido de secado rápido, cinchas ajustables de pecho y vientre, y ribete reflectante para poca luz.'
	}
];
