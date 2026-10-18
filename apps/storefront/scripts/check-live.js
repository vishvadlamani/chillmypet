/**
 * Proves a deploy from the outside: every product page the code defines has
 * to answer 200 on the live site, or the release is broken however green the
 * build was. This is the check that would have caught a new product page
 * being a 404 for days, which happened once. A retired product's page
 * (`retired-products.js`) has to redirect to the product it moved to.
 *
 *   node scripts/check-live.js https://chillmypet.com
 *
 * Retries for a few minutes, because a deploy is not visible everywhere at
 * once and the first request after one is also what triggers the Worker's own
 * catalogue sync (src/lib/server/catalogue.ts). Every request carries a fresh
 * query string so no cache can answer for the previous version. Node's fetch
 * identifies itself as a script, which the Worker treats as a non-browser, so
 * none of these requests becomes a PageView in anyone's analytics.
 */
import { SLUG } from './content.js';
import { PRODUCTS } from './products.js';
import { RETIRED_PRODUCTS } from './retired-products.js';

const origin = (process.argv[2] ?? 'https://chillmypet.com').replace(/\/$/, '');
const deadline = Date.now() + Number(process.env.CHECK_LIVE_TIMEOUT_MS ?? 240_000);
const RETRY_MS = 10_000;

const slugs = [SLUG, ...PRODUCTS.map((p) => p.slug)];
/** What each page must answer: 200, or a redirect to where a retired one moved. */
const pages = [
	...slugs.map((slug) => ({ slug, expect: '200' })),
	...RETIRED_PRODUCTS.map(({ slug, movedTo }) => ({ slug, expect: `308 /products/${movedTo}` }))
];
const failed = [];

for (const { slug, expect } of pages) {
	const url = `${origin}/products/${slug}`;
	let status = 'no response';
	for (;;) {
		try {
			const response = await fetch(`${url}?check=${Date.now()}`, { cache: 'no-store', redirect: 'manual' });
			const location = response.headers.get('location');
			status = location ? `${response.status} ${location.split('?')[0]}` : String(response.status);
		} catch (error) {
			status = `error: ${error.message}`;
		}
		console.log(`${status.padEnd(8)} ${url}`);
		if (status === expect) break;
		if (Date.now() + RETRY_MS > deadline) {
			failed.push(`${url} -> ${status}`);
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
	}
}

if (failed.length > 0) {
	console.error(`\n${failed.length} product page(s) not serving as expected:\n  ${failed.join('\n  ')}`);
	process.exit(1);
}
console.log(`\nall ${slugs.length} product pages answer 200 on ${origin}, and ${RETIRED_PRODUCTS.length} retired one(s) redirect`);
