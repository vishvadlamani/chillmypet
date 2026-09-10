/**
 * Dedupe coverage: does every browser event have a server event with the same id?
 *
 * This is the number Events Manager reports back as "event coverage", and it is
 * measured here the way Meta measures it — by matching `event_id` across the two
 * halves, not by trusting that we meant to send both. The Conversions API is
 * pointed at a local capture server, so a run asserts on the exact bodies that
 * would have gone to Meta without sending anything to a real ad account.
 *
 *   node tests/dedupe-flow.mjs
 *
 * Expects a dev server with NO STRIPE_SECRET_KEY, started with:
 *   META_CAPI_ACCESS_TOKEN=test-token
 *   META_CAPI_ENDPOINT=http://127.0.0.1:12113
 * See `npm run test:dedupe`.
 */
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const PRODUCT = `${BASE}/products/dog-life-jacket`;
const CAPI_PORT = Number(process.env.CAPI_MOCK_PORT ?? 12113);

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

// --- capture server, standing in for graph.facebook.com --------------------
const serverEvents = [];
const capi = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		try {
			const parsed = JSON.parse(body);
			for (const event of parsed.data ?? []) serverEvents.push(event);
		} catch {
			// A body we can't read is a failure the assertions will show.
		}
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ events_received: 1, messages: [] }));
	});
});
await new Promise((resolve) => capi.listen(CAPI_PORT, '127.0.0.1', resolve));

// Beacons are fire-and-forget by design, so give the round trip a moment.
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));
const serverEvent = (name, id) =>
	serverEvents.find((e) => e.event_name === name && e.event_id === id);

// --- the endpoint's own rules, before any browser is involved --------------
// Each of these is an event that must never reach an ad account.
{
	const post = (body) =>
		fetch(`${BASE}/api/events`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: BASE },
			body: JSON.stringify(body)
		});

	const ok = await post({
		eventName: 'AddToCart',
		eventId: 'bridge-probe-1',
		eventSourceUrl: PRODUCT,
		customData: { currency: 'USD', value: '44.97', content_ids: ['CMP-LJ-BLU-M'] }
	});
	check('the bridge answers 204 and says nothing else', ok.status === 204);

	await Promise.all([
		post({ eventName: 'AddToCart', eventSourceUrl: PRODUCT }),
		post({ eventName: 'Purchase', eventId: 'bridge-probe-purchase', customData: { value: '999' } }),
		post({ eventName: 'bundle_selected', eventId: 'bridge-probe-2' }),
		post({ eventName: 'PageView', eventId: 'bridge-probe-3', eventSourceUrl: 'https://evil.example/x' })
	]);
	await settle();

	check('a valid event is forwarded', Boolean(serverEvent('AddToCart', 'bridge-probe-1')));
	check(
		'an event with no id is dropped rather than double-counted',
		!serverEvents.some((e) => e.event_name === 'AddToCart' && !e.event_id)
	);
	check(
		'the browser cannot report a Purchase',
		!serverEvent('Purchase', 'bridge-probe-purchase'),
		'revenue can be written into the ad account by anyone who can POST'
	);
	check(
		'block-level event names are not forwarded',
		!serverEvents.some((e) => e.event_id === 'bridge-probe-2')
	);
	check(
		"another site's URL is not attributed to us",
		serverEvent('PageView', 'bridge-probe-3')?.event_source_url?.startsWith(BASE) ?? false
	);

	const forwarded = serverEvent('AddToCart', 'bridge-probe-1');
	check('the server copy carries the customer IP', Boolean(forwarded?.user_data?.client_ip_address));
	check('and their user agent', Boolean(forwarded?.user_data?.client_user_agent));
	check(
		'and the value, unchanged',
		forwarded?.custom_data?.value === '44.97',
		`got ${forwarded?.custom_data?.value}`
	);
}

// --- the funnel, in a real browser -----------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
// Block Meta's script only: `fbq` stays the stub the snippet defines, so every
// call lands in fbq.queue where the ids are readable. The bridge posts to our
// own origin and is deliberately left alone.
await ctx.route('**/connect.facebook.net/**', (route) => route.abort());
await ctx.route('**/facebook.com/tr*', (route) => route.abort());
const page = await ctx.newPage();

/** Every browser event on the page, as {name, id}. */
const browserEvents = () =>
	page.evaluate(() =>
		(window.fbq?.queue ?? [])
			.map((args) => Array.from(args))
			.filter((c) => c[0] === 'track')
			.map((c) => ({ name: c[1], id: c[3]?.eventID }))
	);

// A click id on the landing URL: what a real visitor arrives from an ad with,
// and the single strongest match signal the server copy can carry.
await page.goto(`${PRODUCT}?fbclid=dedupetestclickid`, { waitUntil: 'networkidle' });
await page.locator('label').filter({ hasText: /3 ×/ }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /buy now/i }).last().click();
await page.waitForURL('**/checkout', { timeout: 15000 });
await page.waitForSelector('form dl');
await settle(2500);

const fired = await browserEvents();
const names = [...new Set(fired.map((e) => e.name))];

check(
	'the funnel fired the events it should have',
	['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout'].every((n) => names.includes(n)),
	`saw ${names.join(', ')}`
);

// The two numbers Events Manager reports, computed the same way.
const labelled = fired.filter((e) => typeof e.id === 'string' && e.id.length > 0);
const covered = fired.filter((e) => e.id && serverEvent(e.name, e.id));

check(
	'every browser event carries a dedupe key',
	labelled.length === fired.length,
	`${fired.length - labelled.length} of ${fired.length} went out unlabelled: ` +
		fired.filter((e) => !e.id).map((e) => e.name).join(', ')
);
check(
	'every browser event has a server event under the same id',
	covered.length === fired.length,
	`${covered.length}/${fired.length} covered — missing ` +
		fired.filter((e) => !(e.id && serverEvent(e.name, e.id))).map((e) => e.name).join(', ')
);
check(
	'every server event carries a dedupe key',
	serverEvents.every((e) => typeof e.event_id === 'string' && e.event_id.length > 0),
	`${serverEvents.filter((e) => !e.event_id).length} of ${serverEvents.length} have none`
);
check(
	'no event is sent to the server twice under one id',
	new Set(serverEvents.map((e) => `${e.event_name}:${e.event_id}`)).size === serverEvents.length,
	'a duplicated server event is a double-counted conversion'
);

// The first PageView is the one that used to have no id at all: it comes from
// the snippet in app.html, before any of the app's own code has run.
const firstPageView = fired.find((e) => e.name === 'PageView');
check('the snippet PageView is deduped too', Boolean(serverEvent('PageView', firstPageView?.id)));

const landing = serverEvent('PageView', firstPageView?.id);
check(
	'the server copy keeps the click id from the landing URL',
	landing?.user_data?.fbc?.endsWith('dedupetestclickid') ?? false,
	`fbc was ${landing?.user_data?.fbc ?? 'absent'}`
);
check(
	'and the page it happened on, not the beacon URL',
	landing?.event_source_url?.includes('/products/dog-life-jacket') ?? false,
	`got ${landing?.event_source_url}`
);

const addToCart = fired.find((e) => e.name === 'AddToCart');
check(
	'AddToCart reaches the server worth the whole bundle',
	serverEvent('AddToCart', addToCart?.id)?.custom_data?.value === '134.91',
	`got ${serverEvent('AddToCart', addToCart?.id)?.custom_data?.value}`
);

await browser.close();
capi.close();
console.log(
	`\n${covered.length}/${fired.length} browser events covered by a server event.\n` +
		(failures === 0 ? 'Dedupe flow OK.' : `${failures} failure(s).`)
);
process.exit(failures === 0 ? 0 : 1);
