/**
 * The Christmas hoodie page's worker, offline: Meta is a stub and Stripe's
 * events are signed here with a test secret.
 *
 *   node landing/christmas-pouch-hoodie.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import worker from './christmas-pouch-hoodie/_worker.js';

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

const sent = [];
// What the stub Meta answers; a test swaps it to see how a refusal is handled.
const accepted = () => new Response('{"events_received":1}', { status: 200 });
let meta = accepted;
globalThis.fetch = async (url, init) => {
	// Events go as JSON; the token probe as a form, the way Meta was proven to answer it.
	const body = typeof init.body === 'string' ? JSON.parse(init.body) : new URLSearchParams(init.body);
	sent.push({ url: String(url), body });
	return meta();
};

const SECRET = 'whsec_test';
const env = {
	META_CAPI_ACCESS_TOKEN: 'token',
	STRIPE_WEBHOOK_SECRET: SECRET,
	ASSETS: { fetch: async () => new Response('page') }
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const ORIGIN = 'https://chillmypet-christmas.pages.dev';
// An _fbc as Meta's Parameter Builder writes it on this host: subdomain index 2,
// the click id, and its 8-character appendix.
const BUILT_FBC = 'fb.2.1760000000000.abc.AQQCAQMC';

function signed(event) {
	const raw = JSON.stringify(event);
	const t = Math.floor(Date.now() / 1000);
	const v1 = createHmac('sha256', SECRET).update(`${t}.${raw}`).digest('hex');
	return new Request(`${ORIGIN}/api/stripe-webhook`, {
		method: 'POST',
		headers: { 'Stripe-Signature': `t=${t},v1=${v1}` },
		body: raw
	});
}
const session = (metadata, extra = {}) => ({
	id: 'evt_1',
	type: 'checkout.session.completed',
	created: 1790000000,
	data: {
		object: {
			id: 'cs_live_abc',
			payment_status: 'paid',
			amount_total: 5499,
			currency: 'usd',
			metadata,
			customer_details: { email: 'Holly@Example.com', name: 'Holly Ivy', address: { country: 'US', postal_code: '94107', city: 'San Francisco', state: 'CA' } },
			...extra
		}
	}
});

// --- a Christmas sale ----------------------------------------------------------
{
	sent.length = 0;
	const res = await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-STOCKING-GREEN-L' })), env, ctx);
	const body = await res.json();
	const e = sent[0]?.body.data[0];
	check('a paid Christmas session is reported', res.status === 200 && body.handled === true, JSON.stringify(body));
	check('to dataset 1341978141149107', sent[0]?.url.includes('/1341978141149107/events'));
	check('as Purchase under the session id the thank-you page uses', e?.event_name === 'Purchase' && e?.event_id === 'cs_live_abc');
	check('naming the SKU', JSON.stringify(e?.custom_data.content_ids) === '["CMP-XH-STOCKING-GREEN-L"]', JSON.stringify(e?.custom_data));
	check('worth what was charged', e?.custom_data.value === 54.99 && e?.custom_data.currency === 'USD');
	check('with hashed buyer details', /^[0-9a-f]{64}$/.test(e?.user_data.em?.[0] ?? '') && /^[0-9a-f]{64}$/.test(e?.user_data.country?.[0] ?? ''));
}

// --- the sale names the same visitor as the page's events -------------------------
{
	const VID = 'a'.repeat(64);
	sent.length = 0;
	await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' }, { client_reference_id: VID })), env, ctx);
	const e = sent[0]?.body.data[0];
	check('the link’s visitor id is the Purchase’s external_id, as it is', JSON.stringify(e?.user_data.external_id) === JSON.stringify([VID]), JSON.stringify(e?.user_data));
	check('alongside the hashed buyer details', /^[0-9a-f]{64}$/.test(e?.user_data.em?.[0] ?? ''));

	sent.length = 0;
	await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' }, { client_reference_id: 'order-from-elsewhere' })), env, ctx);
	check('a client_reference_id of any other shape is not sent as one', !('external_id' in (sent[0]?.body.data[0].user_data ?? {})), JSON.stringify(sent[0]?.body.data[0].user_data));
}

// --- what it must not report -----------------------------------------------------
{
	sent.length = 0;
	const other = await (await worker.fetch(signed(session({ slug: 'pouch-pet-hoodie' })), env, ctx)).json();
	check('another product’s sale is ignored', other.handled === false && sent.length === 0, JSON.stringify(other));

	const unpaid = await (await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' }, { payment_status: 'unpaid' })), env, ctx)).json();
	check('an unpaid session is not a sale', unpaid.handled === false && sent.length === 0, JSON.stringify(unpaid));

	const forged = new Request(`${ORIGIN}/api/stripe-webhook`, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=00' }, body: JSON.stringify(session({ slug: 'christmas-pouch-hoodie' })) });
	const res = await worker.fetch(forged, env, ctx);
	check('an unsigned event is refused', res.status === 400 && sent.length === 0);
}

// --- browser events get their server copy, same id ---------------------------------
{
	sent.length = 0;
	waits.length = 0;
	const beacon = (name, data) =>
		worker.fetch(
			new Request(`${ORIGIN}/api/event`, {
				method: 'POST',
				headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'test', Cookie: `_fbp=fb.1.1.2; _fbc=${BUILT_FBC}` },
				body: JSON.stringify({ name, id: `id-${name}-123`, url: `${ORIGIN}/?fbclid=abc`, data })
			}),
			env,
			ctx
		);
	const cart = { content_type: 'product', content_ids: ['CMP-XH-SANTA-RED-M', 'evil'], contents: [{ id: 'CMP-XH-SANTA-RED-M', quantity: 1, item_price: 54.99 }], num_items: 1, value: 54.99, currency: 'USD' };
	const r1 = await beacon('AddToCart', cart);
	await beacon('InitiateCheckout', cart);
	await beacon('Purchase', cart);
	await Promise.all(waits);
	check('beacons answer 204 at once', r1.status === 204);
	const names = sent.map((s) => s.body.data[0].event_name);
	check('AddToCart and InitiateCheckout are mirrored', names.includes('AddToCart') && names.includes('InitiateCheckout'), names.join());
	check('a browser cannot claim a Purchase', !names.includes('Purchase'));
	const add = sent.find((s) => s.body.data[0].event_name === 'AddToCart')?.body.data[0];
	check('the server copy keeps the browser’s event id', add?.event_id === 'id-AddToCart-123');
	check('unknown content ids are dropped', JSON.stringify(add?.custom_data.content_ids) === '["CMP-XH-SANTA-RED-M"]', JSON.stringify(add?.custom_data));
	check('fbp and fbc ride along', add?.user_data.fbp === 'fb.1.1.2' && add?.user_data.fbc === BUILT_FBC, JSON.stringify(add?.user_data));
	check('no visitor cookie, no external_id', !('external_id' in (add?.user_data ?? {})));
}

// --- the visitor id from pixel.js goes out exactly as the pixel sends it ------------
{
	const copyWith = async (cookie) => {
		sent.length = 0;
		waits.length = 0;
		await worker.fetch(
			new Request(`${ORIGIN}/api/event`, {
				method: 'POST',
				headers: { Cookie: cookie },
				body: JSON.stringify({ name: 'ViewContent', id: 'id-ViewContent-123', url: `${ORIGIN}/`, data: {} })
			}),
			env,
			ctx
		);
		await Promise.all(waits);
		return sent[0]?.body.data[0].user_data;
	};
	const VID = '0123456789abcdef'.repeat(4);
	const ok = await copyWith(`_fbp=fb.1.1.2; cmp_vid=${VID}`);
	check('the visitor id is the external_id, unhashed like the pixel’s', JSON.stringify(ok?.external_id) === JSON.stringify([VID]), JSON.stringify(ok));
	const odd = await copyWith('cmp_vid=<script>');
	check('a visitor cookie of any other shape is dropped', !('external_id' in (odd ?? {})), JSON.stringify(odd));
}

// --- fbc: the browser's _fbc, byte for byte, and never one built here ---------------
// Events Manager flagged the fb.1.<ms>.<fbclid> this worker used to mint as a
// "modified fbclid". pixel.js runs Meta's Parameter Builder, which already
// replaces an earlier click's cookie with the URL's, so the cookie is the answer.
{
	const fbcFor = async (cookie, url) => {
		sent.length = 0;
		waits.length = 0;
		await worker.fetch(
			new Request(`${ORIGIN}/api/event`, {
				method: 'POST',
				headers: { Cookie: cookie },
				body: JSON.stringify({ name: 'PageView', id: 'id-PageView-123', url, data: {} })
			}),
			env,
			ctx
		);
		await Promise.all(waits);
		return sent[0]?.body.data[0].user_data.fbc;
	};
	const built = await fbcFor(`_fbp=fb.1.1.2; _fbc=${BUILT_FBC}`, `${ORIGIN}/?fbclid=abc`);
	check('the builder’s _fbc is sent exactly, appendix and all', built === BUILT_FBC, built);
	const noCookie = await fbcFor('_fbp=fb.1.1.2', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('no _fbc is minted from the URL’s fbclid', noCookie === undefined, noCookie);
	const other = await fbcFor('_fbc=fb.1.1554763741205.OldClick', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('nor does the URL rewrite the cookie the browser holds', other === 'fb.1.1554763741205.OldClick', other);
	const mixed = await fbcFor('_fbc=fb.2.1554763741205.IwZXh0bgNhZW0BMABhZGlk_aem_AbC-dEf.AQQCAQMC', `${ORIGIN}/`);
	check('the click id is never lowercased or cut', mixed === 'fb.2.1554763741205.IwZXh0bgNhZW0BMABhZGlk_aem_AbC-dEf.AQQCAQMC', mixed);
	const malformed = await fbcFor('_fbc=testclickid', `${ORIGIN}/`);
	check('a cookie not in Meta’s format is not sent', malformed === undefined, malformed);
}

// --- a token pasted by hand into the dashboard ----------------------------------------
{
	const { META_CAPI_ACCESS_TOKEN, ...rest } = env;
	const sale = (e) => worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' })), e, ctx);

	sent.length = 0;
	const padded = await sale({ ...rest, 'META_CAPI_ACCESS_TOKEN ': '  token\n' });
	check('a stray space in the name or value still finds the token', padded.status === 200 && sent[0]?.url.endsWith('access_token=token'), sent[0]?.url);

	const empty = await (await sale({ ...rest, META_CAPI_ACCESS_TOKEN: '' })).json();
	check('an empty token is named as empty, not missing', empty.reason === 'META_CAPI_ACCESS_TOKEN is set but empty', empty.reason);

	const none = await (await sale(rest)).json();
	check('no token at all is named as missing', none.reason === 'missing META_CAPI_ACCESS_TOKEN', none.reason);
}

// --- when Meta says no: Stripe must hear about it ------------------------------------
// Stripe resends a non-2xx for three days and shows the endpoint failing. A
// refusal Meta would repeat is a bug in the event that hits every sale, so it
// fails loudly too; the reason only says whether a resend can help.
{
	const sale = () => worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' })), env, ctx);
	const metaError = (status, code, message) => () => Response.json({ error: { message, type: 'OAuthException', code } }, { status });

	meta = metaError(400, 100, 'Invalid parameter');
	const refused = await sale();
	const refusedBody = await refused.json();
	check('an event Meta refuses as built still fails, so a broken Purchase cannot pass for a sale reported', refused.status === 502 && refusedBody.reason === 'meta_refused', `${refused.status} ${JSON.stringify(refusedBody)}`);
	check('with Meta’s reason in the answer, for the Dashboard', /400 100 Invalid parameter/.test(refusedBody.detail ?? ''), refusedBody.detail);

	meta = metaError(400, 190, 'Error validating access token');
	const token = await sale();
	check('a token Meta rejects is retried, and named as fixable', token.status === 502 && (await token.json()).reason === 'meta_unavailable');

	meta = () => new Response('Service Unavailable', { status: 503 });
	check('Meta being down is retried', (await sale()).status === 502);

	meta = metaError(429, 4, 'Application request limit reached');
	check('a rate limit is retried', (await sale()).status === 502);

	meta = () => { throw new TypeError('fetch failed'); };
	check('a network failure is retried', (await sale()).status === 502);

	meta = accepted;
}

// --- /api/meta-status: can the server copies land at all? ----------------------------
// /api/event answers 204 whatever Meta says, so a token for another dataset
// loses every server copy in silence and Events Manager reports no dedupe key
// and no coverage. This is the one place that can be seen from outside.
{
	const status = async (e = env) => {
		const res = await worker.fetch(new Request(`${ORIGIN}/api/meta-status`), e, ctx);
		return { status: res.status, body: await res.json() };
	};

	sent.length = 0;
	meta = () => Response.json({ error: { message: '(#100) The parameter data must be non-empty', code: 100 } }, { status: 400 });
	const ok = await status();
	check('a token Meta takes for the dataset reads as accepted', ok.status === 200 && ok.body.server_events === 'accepted' && ok.body.dataset === '1341978141149107', JSON.stringify(ok));
	check('asked with an empty batch, so no event is sent', sent.length === 1 && sent[0].url.endsWith('/1341978141149107/events') && sent[0].body.get('data') === '[]', JSON.stringify(sent));
	sent.length = 0;
	await status();
	check('and answered from memory for a few minutes', sent.length === 0, `${sent.length} probe(s)`);

	const WRONG = 'EAAtokenForAnotherDataset123456';
	meta = () => Response.json({ error: { message: `Malformed access token ${WRONG}`, code: 190 } }, { status: 400 });
	const wrong = await status({ ...env, META_CAPI_ACCESS_TOKEN: WRONG });
	check('a token Meta refuses reads as rejected, with a 503', wrong.status === 503 && wrong.body.server_events === 'rejected', JSON.stringify(wrong));
	check('with Meta’s reason, never the token', /^\(#190\) Malformed access token \[token\]$/.test(wrong.body.detail ?? '') && !JSON.stringify(wrong.body).includes(WRONG), wrong.body.detail);

	const { META_CAPI_ACCESS_TOKEN, ...rest } = env;
	const none = await status(rest);
	check('no token reads as not configured, and says which', none.status === 503 && none.body.server_events === 'not_configured' && none.body.detail === 'missing META_CAPI_ACCESS_TOKEN', JSON.stringify(none));

	const posted = await worker.fetch(new Request(`${ORIGIN}/api/meta-status`, { method: 'POST' }), env, ctx);
	check('it only answers GET', posted.status === 405);

	meta = accepted;
}

// --- quiet mode: the owner's tests and preview copies send nothing ---------------------
{
	sent.length = 0;
	const test = await (await worker.fetch(signed(session({ slug: 'christmas-pouch-hoodie', sku: 'CMP-XH-SANTA-RED-S' }, { client_reference_id: 'test_' + 'a'.repeat(64) })), env, ctx)).json();
	check('a checkout started in test mode is not reported, even when paid', test.handled === false && test.reason === 'test' && sent.length === 0, JSON.stringify(test));

	const copy = async (origin, cookie) => {
		sent.length = 0;
		waits.length = 0;
		const res = await worker.fetch(
			new Request(`${origin}/api/event`, {
				method: 'POST',
				headers: { 'User-Agent': 'test', Cookie: cookie },
				body: JSON.stringify({ name: 'AddToCart', id: 'id-AddToCart-q', url: `${origin}/`, data: {} })
			}),
			env,
			ctx
		);
		await Promise.all(waits);
		return { status: res.status, n: sent.length };
	};
	const tester = await copy(ORIGIN, '_fbp=fb.1.1.2; cmp_test=1');
	check('a test visitor’s event is answered but not sent', tester.status === 204 && tester.n === 0, JSON.stringify(tester));
	const preview = await copy('https://pr-35.chillmypet-christmas.pages.dev', '_fbp=fb.1.1.2');
	check('nor is one from a preview copy of the page', preview.status === 204 && preview.n === 0, JSON.stringify(preview));
	const live = await copy(ORIGIN, '_fbp=fb.1.1.2; cmp_test=0');
	check('while a live visitor’s still is', live.n === 1, JSON.stringify(live));
}

// --- deploy.sh: a preview never lands on the live page -------------------------------
// Runs the real script against a stand-in npx that only records its arguments
// and what was staged for upload.
{
	const bin = mkdtempSync(join(tmpdir(), 'xmas-deploy-'));
	const log = join(bin, 'args');
	const staged = join(bin, 'staged');
	writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho "$@" > "${log}"\nls "$4" > "${staged}"\n`);
	chmodSync(join(bin, 'npx'), 0o755);
	const folder = new URL('./christmas-pouch-hoodie/', import.meta.url);
	const script = new URL('deploy.sh', folder).pathname;
	const deploy = (extra) => {
		rmSync(log, { force: true });
		rmSync(staged, { force: true });
		const { PREVIEW, ...rest } = process.env;
		try {
			execFileSync('sh', [script], { env: { ...rest, ...extra, PATH: `${bin}:${process.env.PATH}` }, stdio: 'pipe' });
			return readFileSync(log, 'utf8');
		} catch {
			return null;
		}
	};
	const files = () => (existsSync(staged) ? readFileSync(staged, 'utf8').split('\n') : []);
	check('without PREVIEW it publishes the live page', / --branch main /.test(deploy({}) ?? ''));
	check('and stages the page, its worker and its photos', ['index.html', 'thank-you.html', '_worker.js', '_routes.json', 'app.js', 'config.js', 'param-builder.js', 'pixel.js', 'style.css', 'red_santa.jpg'].every((f) => files().includes(f)), files().join());
	check('the README and this script are never uploaded', !files().includes('README.md') && !files().includes('deploy.sh'));
	// The ad's video is optional (config.js: video). Staged when a file is
	// there, and no error when none is; tried with a stand-in only while the
	// folder holds no real one, which this must never delete.
	const anyVideo = readdirSync(folder).some((f) => f.endsWith('.mp4'));
	check('with no video in the folder, none is staged and nothing fails', !files().some((f) => f.endsWith('.mp4')) || anyVideo);
	if (!anyVideo) {
		const sample = new URL('hero.mp4', folder);
		writeFileSync(sample, '');
		try {
			deploy({});
			check('a video in the folder is staged with the page', files().includes('hero.mp4'), files().join());
		} finally {
			rmSync(sample, { force: true });
		}
	}
	const pr = deploy({ PREVIEW: 'pr-35' }) ?? '';
	check('PREVIEW=pr-35 publishes a preview under that name', / --branch pr-35 /.test(pr) && !/--branch main/.test(pr), pr);
	check('PREVIEW=main is refused before anything is published', deploy({ PREVIEW: 'main' }) === null && !existsSync(log));
	rmSync(bin, { recursive: true, force: true });
}

// --- the page itself: what it says, and what it must not ------------------------------
// The page is static, so these read the files. A browser pass (phone widths,
// the first screen, Buy reaching the right Payment Link) is in the README.
{
	const folder = new URL('./christmas-pouch-hoodie/', import.meta.url);
	const html = readFileSync(new URL('index.html', folder), 'utf8');
	const js = readFileSync(new URL('app.js', folder), 'utf8');
	const text = html.replace(/<[^>]+>/g, ' ');
	// There are no reviews, ratings or sales counts to show, and an invented one
	// is a fake testimonial under the FTC's rule on consumer reviews (16 CFR 465).
	check('no star rating, review or sales count', !/★|⭐|\b\d[\d,.]*\+?\s*(reviews?|ratings?|customers|sold|happy|five.star)\b|\brated\b|trustpilot|verified buyer|bestseller/i.test(text));
	// What the ChillMP Payment Links offer, read from Stripe on 2026-10-12: card,
	// Link and Apple Pay for a US visitor, Klarna only for one in Europe; Google
	// Pay is off in the account's payment method configuration. Nothing else
	// may be promised until it is on in Stripe (see the README).
	check('only payment methods the Payment Links really offer', !/google pay|klarna|afterpay|affirm|paypal|discover|pay later|instal?lments|interest.free/i.test(text));
	check('the choices, the button and the dock are there', ['id="designs"', 'id="sizes"', 'id="buy"', 'id="dock"', 'id="dock-buy"', 'id="size-chart"', 'id="size-error"', 'id="size-guide"'].every((id) => html.includes(id)), 'an id is missing');
	check('a real way to reach a person, and the policies', html.includes('mailto:contact@chillmypet.com') && html.includes('chillmypet.com/policies/refunds') && html.includes('chillmypet.com/privacy'));
	check('ViewContent on load, AddToCart and InitiateCheckout on Buy', /xmasTrack\('ViewContent'/.test(js) && /xmasTrack\('AddToCart'/.test(js) && /xmasTrack\('InitiateCheckout'/.test(js));
	check('Buy still carries the visitor id to Stripe, test_ in quiet mode', /client_reference_id=/.test(js) && /'test_'/.test(js));
	check('no size is chosen for the visitor', /size: ''/.test(js));

	const window = {};
	new Function('window', readFileSync(new URL('config.js', folder), 'utf8'))(window);
	const c = window.XMAS;
	check('every design and size has a Payment Link', c.designs.every((d) => c.sizes.every((s) => (c.links[`${d.code}:${s}`]?.url ?? '').startsWith('https://buy.stripe.com/'))));
	check('the size chart is absent, or the supplier’s rows', c.sizeChart === null || (Array.isArray(c.sizeChart) && c.sizeChart.length > 0 && c.sizeChart.every((r) => c.sizes.includes(r.size) && typeof r.chestCm === 'number' && typeof r.lengthCm === 'number')), JSON.stringify(c.sizeChart));
	check('no video is asked for until its file is in the folder', c.video === '' || existsSync(new URL(c.video, folder)), c.video);
}

// --- the page's own scripts: Meta's Parameter Builder writes the ids ----------------
// Runs the real config.js, param-builder.js and pixel.js against a stand-in
// browser: a cookie jar that refuses public suffixes the way a browser does,
// and a sendBeacon that records what /api/event would get.
{
	const folder = new URL('./christmas-pouch-hoodie/', import.meta.url);
	const source = (f) => readFileSync(new URL(f, folder), 'utf8');
	const bundle = readFileSync(new URL('param-builder.js', folder));
	// Meta's published meta-capi-param-builder-clientjs 1.3.2, byte for byte. To
	// update: copy dist/clientParamBuilder.bundle.js from the new version's
	// package over param-builder.js, then change this hash and the version in
	// pixel.js and the README.
	check('param-builder.js is Meta’s bundle, unmodified', createHash('sha256').update(bundle).digest('hex') === '8edc1086362f218e7021136190e50d4d3cdf0f9910d33c1bea7e7fad37b2c880');
	for (const page of ['index.html', 'thank-you.html']) {
		const html = source(page);
		const at = (f) => html.indexOf(`<script src="${f}"></script>`);
		check(`${page} loads the builder after config.js and before pixel.js`, at('config.js') >= 0 && at('config.js') < at('param-builder.js') && at('param-builder.js') < at('pixel.js'));
	}

	const visit = async (href, cookies = {}) => {
		const url = new URL(href);
		const jar = new Map(Object.entries(cookies));
		const beacons = [];
		const window = {
			location: { href, hostname: url.hostname, search: url.search },
			navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', vendor: 'Apple Computer, Inc.', sendBeacon: (to, body) => beacons.push({ to, body: JSON.parse(body) }) },
			document: {
				referrer: '',
				visibilityState: 'visible',
				get cookie() {
					return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
				},
				set cookie(line) {
					const [pair, ...attrs] = line.split(';').map((p) => p.trim());
					const i = pair.indexOf('=');
					const domain = (attrs.find((a) => /^domain=/i.test(a)) ?? '').slice(7).replace(/^\./, '');
					if (domain && (['dev', 'pages.dev'].includes(domain) || !(url.hostname === domain || url.hostname.endsWith('.' + domain)))) return;
					if (attrs.some((a) => /^max-age=0$/i.test(a))) jar.delete(pair.slice(0, i));
					else jar.set(pair.slice(0, i), pair.slice(i + 1));
				},
				createElement: () => ({}),
				getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
				addEventListener() {}
			},
			addEventListener() {},
			setTimeout,
			URL,
			URLSearchParams,
			btoa,
			atob,
			crypto: globalThis.crypto,
			console: { ...console, warn() {} },
			Promise
		};
		window.window = window.self = window;
		const context = vm.createContext(window);
		for (const f of ['config.js', 'param-builder.js', 'pixel.js']) vm.runInContext(source(f), context, { filename: f });
		await new Promise((r) => setTimeout(r, 400));
		return { fbc: jar.get('_fbc'), fbp: jar.get('_fbp'), beacons };
	};

	const CLICK = 'IwZXh0bgNhZW0BMABhZGlkAasYSq_aem_AbC-dEf';
	const landed = await visit(`${ORIGIN}/?utm_source=facebook&fbclid=${CLICK}`);
	check('an ad click lands as the builder’s _fbc, click id intact', new RegExp(`^fb\\.2\\.\\d{13}\\.${CLICK}\\.[A-Za-z0-9_-]{8}$`).test(landed.fbc ?? ''), landed.fbc);
	check('and an _fbp beside it', /^fb\.2\.\d{13}\.\d+\.[A-Za-z0-9_-]{8}$/.test(landed.fbp ?? ''), landed.fbp);
	check('PageView’s server copy goes once the ids exist', landed.beacons.length === 1 && landed.beacons[0].to === '/api/event' && landed.beacons[0].body.name === 'PageView', JSON.stringify(landed.beacons));

	// What the worker sends for that beacon is the cookie, character for character.
	sent.length = 0;
	waits.length = 0;
	await worker.fetch(
		new Request(`${ORIGIN}/api/event`, { method: 'POST', headers: { Cookie: `_fbp=${landed.fbp}; _fbc=${landed.fbc}` }, body: JSON.stringify(landed.beacons[0]?.body ?? {}) }),
		env,
		ctx
	);
	await Promise.all(waits);
	const user = sent[0]?.body.data[0].user_data ?? {};
	check('and the server copy carries exactly the builder’s fbc and fbp', user.fbc === landed.fbc && user.fbp === landed.fbp, JSON.stringify(user));

	const back = await visit(`${ORIGIN}/?fbclid=SecondClick`, { _fbc: 'fb.2.1554763741205.FirstClick' });
	check('a second ad click replaces the first click’s cookie', /^fb\.2\.\d{13}\.SecondClick\.[A-Za-z0-9_-]{8}$/.test(back.fbc ?? '') && !back.fbc.includes('1554763741205'), back.fbc);
	const later = await visit(`${ORIGIN}/`, { _fbc: 'fb.2.1554763741205.FirstClick' });
	check('a later visit keeps the click and its timestamp, tagged as unchanged', /^fb\.2\.1554763741205\.FirstClick\.[A-Za-z0-9_-]{8}$/.test(later.fbc ?? ''), later.fbc);
	const quiet = await visit(`${ORIGIN}/?test&fbclid=${CLICK}`);
	check('quiet mode runs no builder and sends nothing', quiet.fbc === undefined && quiet.beacons.length === 0, JSON.stringify(quiet));
}

// --- the pixels config.js initialises -------------------------------------------
// Every listed pixel receives every visitor's browsing. Two were listed until
// 2026-10-11: 28272021345717397, which nobody could say whose it was, and the
// retired CZK ad account's 1363695699271757, which nothing running used. Both
// are asserted absent rather than just deleted, so neither drifts back on a copy.
{
	const window = {};
	new Function('window', readFileSync(new URL('./christmas-pouch-hoodie/config.js', import.meta.url), 'utf8'))(window);
	const ids = window.XMAS.pixelIds;
	check('config initialises the dataset the ads optimise against', ids.includes('1341978141149107'), JSON.stringify(ids));
	check('and not the unclaimed pixel', !ids.includes('28272021345717397'), JSON.stringify(ids));
	check('nor the retired CZK account’s', !ids.includes('1363695699271757'), JSON.stringify(ids));
}

if (failures) {
	console.log(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nChristmas hoodie worker OK.');
