// Every product photo has the copies `resized()` points at. A photo added
// without running `npm run images` would otherwise ship a broken thumbnail.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { photoSrcset, resized, WIDTHS } from './resized.ts';

const staticDir = join(import.meta.dirname, '..', '..', 'static');
let failures = 0;
function check(label: string, cond: boolean, detail = '') {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

function* photos(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* photos(path);
		else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) yield path;
	}
}

const missing: string[] = [];
let count = 0;
for (const photo of photos(join(staticDir, 'products'))) {
	count++;
	const src = '/' + relative(staticDir, photo).split('\\').join('/');
	for (const width of WIDTHS) {
		const copy = join(staticDir, resized(src, width));
		try {
			statSync(copy);
		} catch {
			missing.push(`${src} @${width}`);
		}
	}
}
check(`every product photo (${count}) has its resized copies`, count > 0 && missing.length === 0, `run npm run images; missing: ${missing.slice(0, 5).join(', ')}`);

check('a product photo maps to its 200px copy', resized('/products/a/b.jpg', 200) === '/resized/200/products/a/b.webp');
check('anything else is left alone', resized('https://example.com/x.jpg', 200) === 'https://example.com/x.jpg' && resized('/size-chart.svg', 200) === '/size-chart.svg');
check('the srcset offers the 800px copy and the original', photoSrcset('/products/a/b.jpg', 1254) === '/resized/800/products/a/b.webp 800w, /products/a/b.jpg 1254w');
check('no srcset for a photo with no copies', photoSrcset('/size-chart.svg', 100) === undefined);

if (failures) {
	console.log(`\n${failures} failed.`);
	process.exit(1);
}
console.log('\nResized photos are in place.');
