/**
 * The admin, end to end, against a dev server with payments off:
 *
 *   ADMIN_PASSWORD=test-admin RESEND_API_KEY=re_test \
 *   EMAIL_API_ENDPOINT=http://127.0.0.1:12113 \
 *   META_CAPI_ACCESS_TOKEN=test META_CAPI_ENDPOINT=http://127.0.0.1:12112 \
 *   npm run dev
 *   npm run test:admin
 *
 * No browser: everything here is decided on the server, and the raw responses
 * are what has to be right — the auth challenge, the headers that keep the page
 * out of caches and search, and the absence of any tracking snippet.
 */
import { createServer } from 'node:http';
import { createClient } from '@libsql/client';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'test-admin';
const AUTH = `Basic ${Buffer.from(`owner:${PASSWORD}`).toString('base64')}`;

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

function mock(port) {
	const seen = [];
	const server = createServer((req, res) => {
		let body = '';
		req.on('data', (c) => (body += c));
		req.on('end', () => {
			try {
				seen.push({ path: req.url, headers: req.headers, body: JSON.parse(body) });
			} catch {
				seen.push({ path: req.url, headers: req.headers, body });
			}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ id: `mock_${seen.length}`, events_received: 1 }));
		});
	});
	return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, seen })));
}

const mailer = await mock(Number(process.env.EMAIL_MOCK_PORT ?? 12113));
const capi = await mock(Number(process.env.CAPI_MOCK_PORT ?? 12112));
const settle = () => new Promise((r) => setTimeout(r, 1500));

// --- the door ---------------------------------------------------------------
{
	const anonymous = await fetch(`${BASE}/admin`, { headers: { accept: 'text/html' } });
	check('no credentials: 401', anonymous.status === 401, `got ${anonymous.status}`);
	check('with a Basic challenge', /^Basic /.test(anonymous.headers.get('www-authenticate') ?? ''));
	check('the challenge is not cached', anonymous.headers.get('cache-control') === 'no-store');

	const wrong = await fetch(`${BASE}/admin`, {
		headers: { accept: 'text/html', authorization: `Basic ${Buffer.from('owner:nope').toString('base64')}` }
	});
	check('wrong password: 401', wrong.status === 401, `got ${wrong.status}`);

	const detail = await fetch(`${BASE}/admin/orders/CMP-ANYTHING`, { headers: { accept: 'text/html' } });
	check('order pages are behind the same door', detail.status === 401, `got ${detail.status}`);
}

// --- an order to ship -------------------------------------------------------
const product = await fetch(`${BASE}/products/dog-life-jacket`).then((r) => r.text());
const variant = Number(/variantId["'\s:]+(\d+)/.exec(product)?.[1] ?? 0) || null;
check('found a variant to buy', Boolean(variant));

const placed = await fetch(`${BASE}/checkout`, {
	method: 'POST',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE },
	body: new URLSearchParams({
		email: 'admin-flow@example.com',
		firstName: 'Ada',
		lastName: 'Min',
		address1: '1 Test St',
		city: 'Toronto',
		province: 'ON',
		postalCode: 'M5V 2T6',
		country: 'CA',
		method: 'standard',
		submissionId: `admin-${Date.now()}`,
		lines: JSON.stringify([{ variantId: variant, quantity: 1 }])
	})
}).then((r) => r.text());
const orderNumber = /CMP-[0-9A-F]{8}/.exec(placed)?.[0];
check('placed an order', Boolean(orderNumber), placed.slice(0, 200));

await settle();
check(
	'with payments off, the sale still gets its confirmation email',
	mailer.seen.filter((m) => m.body.subject?.includes(orderNumber) && /confirmed/.test(m.body.subject)).length === 1
);

// Payments are off in this run, so stand in for the webhook that would have
// marked it paid — only a paid order can ship.
const db = createClient({
	url: process.env.TURSO_DATABASE_URL ?? 'file:local.db',
	authToken: process.env.TURSO_AUTH_TOKEN
});
await db.execute({ sql: `update orders set status = 'paid' where order_number = ?`, args: [orderNumber] });

const capiBefore = capi.seen.length;

// --- the list ---------------------------------------------------------------
{
	const response = await fetch(`${BASE}/admin`, {
		headers: { accept: 'text/html', authorization: AUTH, 'user-agent': 'Mozilla/5.0 admin-flow' }
	});
	const html = await response.text();
	check('right password: 200', response.status === 200, `got ${response.status}`);
	check('the paid order is in the queue to ship', html.includes(orderNumber));
	check('the page is not cached', response.headers.get('cache-control') === 'no-store');
	check('nor indexed', /noindex/.test(response.headers.get('x-robots-tag') ?? ''));
	check('no Meta pixel on the admin', !/fbq\('init'/.test(html));
	check('no GTM container on the admin', !/GTM-[A-Z0-9]{4,}/.test(html));
	check('no shop chrome around it', !/href="\/checkout"/.test(html));

	const search = await fetch(`${BASE}/admin?q=admin-flow@example.com`, {
		headers: { accept: 'text/html', authorization: AUTH }
	}).then((r) => r.text());
	check('a customer is found by email', search.includes(orderNumber) && search.includes('Customer'));
}

// --- shipping it ------------------------------------------------------------
const ship = (fields) =>
	fetch(`${BASE}/admin/orders/${orderNumber}?/ship`, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'application/json',
			'x-sveltekit-action': 'true',
			origin: BASE,
			authorization: AUTH
		},
		body: new URLSearchParams(fields)
	}).then((r) => r.json());

{
	const detail = await fetch(`${BASE}/admin/orders/${orderNumber}`, {
		headers: { accept: 'text/html', authorization: AUTH }
	}).then((r) => r.text());
	check('the order page offers to ship it', detail.includes('Mark shipped'));

	const first = await ship({ carrier: 'Canada Post', trackingNumber: 'CP123', trackingUrl: 'https://track.example/CP123' });
	check('marking it shipped succeeds', first.type === 'success', JSON.stringify(first));

	const second = await ship({ carrier: 'Canada Post', trackingNumber: 'CP123' });
	check('a second click does not ship it again', second.type === 'failure' && second.status === 409, JSON.stringify(second));

	await settle();
	const shippedMails = mailer.seen.filter((m) => m.body.subject?.includes(orderNumber) && /on its way/.test(m.body.subject));
	check('the customer gets exactly one shipping email', shippedMails.length === 1, `${shippedMails.length} sent`);
	check('carrying the tracking number', shippedMails[0]?.body.text?.includes('Canada Post CP123'));
	check('to the address on the order', shippedMails[0]?.body.to?.[0] === 'admin-flow@example.com');

	const row = await db.execute({ sql: 'select status from orders where order_number = ?', args: [orderNumber] });
	check('the order stays paid, so no payment path can settle it again', row.rows[0]?.status === 'paid');

	const queue = await fetch(`${BASE}/admin`, { headers: { accept: 'text/html', authorization: AUTH } }).then((r) => r.text());
	check('and it leaves the queue to ship', !queue.includes(orderNumber));
}

await settle();
const adminEvents = capi.seen
	.slice(capiBefore)
	.flatMap((e) => (Array.isArray(e.body?.data) ? e.body.data : []))
	.filter((e) => String(e.event_source_url ?? '').includes('/admin'));
check('nothing on the admin was reported to Meta', adminEvents.length === 0, `${adminEvents.length} event(s)`);

db.close();
mailer.server.close();
capi.server.close();
console.log(failures === 0 ? '\nAdmin flow OK.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
