/**
 * The Christmas hoodie page's worker, offline: Meta is a stub and Stripe's
 * events are signed here with a test secret.
 *
 *   node landing/christmas-pouch-hoodie.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
				headers: { 'CF-Connecting-IP': '203.0.113.9', 'User-Agent': 'test', Cookie: '_fbp=fb.1.1.2' },
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
	check('fbp and fbc ride along', add?.user_data.fbp === 'fb.1.1.2' && /^fb\.1\.\d+\.abc$/.test(add?.user_data.fbc ?? ''));
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

// --- fbc: the click id on the URL wins over a stale cookie ---------------------------
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
	const stale = await fbcFor('_fbp=fb.1.1.2; _fbc=fb.1.1554763741205.OldClick', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('a cookie from an earlier click gives way to the URL’s', /^fb\.1\.\d+\.NeW_Click-Id$/.test(stale ?? '') && !stale.startsWith('fb.1.1554763741205.'), stale);
	const same = await fbcFor('_fbc=fb.1.1554763741205.NeW_Click-Id', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('a cookie carrying the same click keeps its timestamp', same === 'fb.1.1554763741205.NeW_Click-Id', same);
	const noUrl = await fbcFor('_fbc=fb.1.1554763741205.OldClick', `${ORIGIN}/`);
	check('with no click on the URL the cookie is sent as it is', noUrl === 'fb.1.1554763741205.OldClick', noUrl);
	const caseOnly = await fbcFor('_fbc=fb.1.1554763741205.new_click-id', `${ORIGIN}/?fbclid=NeW_Click-Id`);
	check('the click id is never lowercased', /\.NeW_Click-Id$/.test(caseOnly ?? ''), caseOnly);
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
// Runs the real script against a stand-in npx that only records its arguments.
{
	const bin = mkdtempSync(join(tmpdir(), 'xmas-deploy-'));
	const log = join(bin, 'args');
	writeFileSync(join(bin, 'npx'), `#!/bin/sh\necho "$@" > "${log}"\n`);
	chmodSync(join(bin, 'npx'), 0o755);
	const script = new URL('./christmas-pouch-hoodie/deploy.sh', import.meta.url).pathname;
	const deploy = (extra) => {
		rmSync(log, { force: true });
		const { PREVIEW, ...rest } = process.env;
		try {
			execFileSync('sh', [script], { env: { ...rest, ...extra, PATH: `${bin}:${process.env.PATH}` }, stdio: 'pipe' });
			return readFileSync(log, 'utf8');
		} catch {
			return null;
		}
	};
	check('without PREVIEW it publishes the live page', / --branch main /.test(deploy({}) ?? ''));
	const pr = deploy({ PREVIEW: 'pr-35' }) ?? '';
	check('PREVIEW=pr-35 publishes a preview under that name', / --branch pr-35 /.test(pr) && !/--branch main/.test(pr), pr);
	check('PREVIEW=main is refused before anything is published', deploy({ PREVIEW: 'main' }) === null && !existsSync(log));
	rmSync(bin, { recursive: true, force: true });
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
