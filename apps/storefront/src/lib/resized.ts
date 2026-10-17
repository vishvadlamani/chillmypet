/**
 * Smaller copies of the product photos, written by `npm run images`.
 *
 * The photos under `static/products/` are 1200–1500px JPEGs of 110–260 KB,
 * sized for a desktop zoom. A phone in the Facebook app draws the main photo
 * about 350px wide and a thumbnail about 60px, and was downloading the full
 * file for every one of them: five thumbnails alone were a megabyte on mobile
 * data, before the buyer saw a price. Each photo now has two WebP copies:
 *
 *   /resized/200/products/<slug>/<name>.webp   thumbnails, bundle cards, checkout
 *   /resized/800/products/<slug>/<name>.webp   the main photo on a phone
 *
 * Anything not under `/products/` (a placeholder, a remote URL) is returned
 * unchanged, so a missing copy can only ever mean the full photo, never a
 * broken image. `resized.test.ts` fails when a photo has no copies.
 */
export const WIDTHS = [200, 800] as const;
export type Width = (typeof WIDTHS)[number];

const PHOTO = /^\/products\/(.+)\.(jpe?g|png|webp)$/i;

export function resized(src: string, width: Width): string {
	const match = PHOTO.exec(src);
	return match ? `/resized/${width}/products/${match[1]}.webp` : src;
}

/** `srcset` for a main photo: the phone-sized copy, then the original. */
export function photoSrcset(src: string, originalWidth: number): string | undefined {
	return PHOTO.test(src) ? `${resized(src, 800)} 800w, ${src} ${originalWidth}w` : undefined;
}
