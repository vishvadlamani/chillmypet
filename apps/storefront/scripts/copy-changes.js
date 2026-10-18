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
import { CHRISTMAS_PET_HOODIE } from './christmas-pet-hoodie.js';
import { PET_CHRISTMAS_COSTUME } from './pet-christmas-costume.js';
import { PET_SANTA_COSTUME } from './pet-santa-costume.js';

const costume = PET_CHRISTMAS_COSTUME.translations.en;
const hoodie = CHRISTMAS_PET_HOODIE.translations.en;
const santa = PET_SANTA_COSTUME.translations.en;

/** @type {{ slug: string, locale: string, field: 'title' | 'subtitle' | 'description', from: string, to: string }[]} */
export const COPY_CHANGES = [
	// "Pet", not "Dog" (owner's call, 2026-10-17): small dogs and cats.
	{
		slug: 'pet-christmas-costume',
		locale: 'en',
		field: 'title',
		from: 'Dog Christmas Tree Costume',
		to: costume.title
	},
	{
		slug: 'pet-christmas-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your dog into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	},
	// "Pet", never "dog" or "cat", in a name or a description (the owner's
	// call, 2026-10-18). Slugs are renamed first (`slug-changes.js`), so these
	// find the rows under their new slugs.
	{
		slug: 'pet-christmas-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your dog or cat into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	},
	{
		slug: 'christmas-pet-hoodie',
		locale: 'en',
		field: 'title',
		from: 'Reindeer Christmas Dog Hoodie',
		to: hoodie.title
	},
	{
		slug: 'christmas-pet-hoodie',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush hoodie that turns your dog into one of Santa’s reindeer. Brown antlers on the hood, fluffy white trim, white snap buttons down the front and a Christmas tree patch on the back. For small dogs, sizes S to XL.',
		to: hoodie.description ?? ''
	},
	{
		slug: 'pet-santa-costume',
		locale: 'en',
		field: 'title',
		from: 'Santa Pet Costume with Gift',
		to: santa.title
	},
	{
		slug: 'pet-santa-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft red plush Santa suit with white fur trim and a black belt, and two little plush arms out front holding a wrapped present, so your pet looks like Santa making a delivery. Comes with a matching Santa hat. For small dogs and cats, sizes S to L.',
		to: santa.description ?? ''
	}
];
