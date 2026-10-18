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
import { DOG_CHRISTMAS_COSTUME } from './dog-christmas-costume.js';

const costume = DOG_CHRISTMAS_COSTUME.translations.en;

/** @type {{ slug: string, locale: string, field: 'title' | 'subtitle' | 'description', from: string, to: string }[]} */
export const COPY_CHANGES = [
	// "Pet", not "Dog" (owner's call, 2026-10-17): small dogs and cats.
	{
		slug: 'dog-christmas-costume',
		locale: 'en',
		field: 'title',
		from: 'Dog Christmas Tree Costume',
		to: costume.title
	},
	{
		slug: 'dog-christmas-costume',
		locale: 'en',
		field: 'description',
		from: 'A soft hooded cape that turns your dog into a little Christmas tree. Three ruffled tiers, colourful pom-pom baubles and a glitter gold star on the hood. It ties at the neck and closes with one button, so it goes on in seconds and comes off just as fast. For small dogs and cats, in red or green, sizes S to L by weight.',
		to: costume.description ?? ''
	}
];
