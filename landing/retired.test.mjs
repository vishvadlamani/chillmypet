// Drives landing/retired/_worker.js, the redirect both retired landing pages
// now serve. It lives beside the folder, not in it, because the folder is what
// gets published. Run: node landing/retired.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker, { SELLING_INSTEAD } from './retired/_worker.js';

const hit = (url, init) => worker.fetch(new Request(url, init));

let n = 0;
async function test(name, fn) {
	await fn();
	n += 1;
	console.log(`PASS  ${name}`);
}

for (const host of ['https://chillmypet-christmas.pages.dev', 'https://chillmypet-hoodie.pages.dev']) {
	await test(`${host}: the page goes to the costume, query kept`, async () => {
		const res = await hit(`${host}/?fbclid=abc&utm_source=facebook`);
		assert.equal(res.status, 302);
		assert.equal(res.headers.get('location'), `${SELLING_INSTEAD}?fbclid=abc&utm_source=facebook`);
	});
	await test(`${host}: so does any other path, the thank-you page included`, async () => {
		for (const path of ['/thank-you.html', '/red_santa.jpg', '/index.html']) {
			const res = await hit(host + path);
			assert.equal(res.status, 302, path);
			assert.equal(res.headers.get('location'), SELLING_INSTEAD, path);
		}
	});
	await test(`${host}: the hoodie's own choices are dropped`, async () => {
		const res = await hit(`${host}/?design=red_santa&size=M&added=1&utm_campaign=x`);
		assert.equal(res.headers.get('location'), `${SELLING_INSTEAD}?utm_campaign=x`);
	});
	await test(`${host}: the old API answers 410 and reports nothing`, async () => {
		const calls = [];
		const real = globalThis.fetch;
		globalThis.fetch = async (...args) => (calls.push(args), new Response(null));
		try {
			for (const path of ['/api/event', '/api/purchase', '/api/stripe-webhook', '/api/meta-status']) {
				const res = await hit(host + path, { method: 'POST', body: '{"name":"PageView"}' });
				assert.equal(res.status, 410, path);
			}
		} finally {
			globalThis.fetch = real;
		}
		assert.equal(calls.length, 0, 'nothing is sent to Meta or Stripe');
	});
}

await test('every path reaches the worker', async () => {
	const routes = JSON.parse(readFileSync(new URL('./retired/_routes.json', import.meta.url), 'utf8'));
	assert.deepEqual(routes.include, ['/*']);
	assert.deepEqual(routes.exclude, []);
});

await test('no pixel is left in the published files', async () => {
	const html = readFileSync(new URL('./retired/index.html', import.meta.url), 'utf8');
	assert.doesNotMatch(html, /fbq|connect\.facebook\.net|googletagmanager/);
});

console.log(`\n${n} passed`);
