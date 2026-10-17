// Writes the smaller WebP copies `$lib/resized.ts` points at, for every photo
// under static/products/. Run it after adding or replacing a product photo:
//
//   npm run images
//
// Copies are committed, like the photos: the Worker serves static files and
// cannot resize. Existing copies newer than their photo are left alone.
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'static');
const WIDTHS = [200, 800];

async function* photos(dir) {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* photos(path);
		else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) yield path;
	}
}

let written = 0;
for await (const photo of photos(join(root, 'products'))) {
	const rel = relative(root, photo).replace(/\.[^.]+$/, '.webp');
	const { mtimeMs } = await stat(photo);
	for (const width of WIDTHS) {
		const out = join(root, 'resized', String(width), rel);
		const existing = await stat(out).catch(() => null);
		if (existing && existing.mtimeMs >= mtimeMs) continue;
		await mkdir(dirname(out), { recursive: true });
		// Never upscale: a copy wider than its photo is the same pixels, heavier.
		await sharp(photo).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
		written++;
	}
}
console.log(`Wrote ${written} resized cop${written === 1 ? 'y' : 'ies'}.`);
