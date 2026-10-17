/**
 * Offline checks for the order confirmation email. Runs under plain Node:
 *
 *   node --experimental-strip-types src/lib/server/email.test.ts
 */
import type { Order } from 'ecomwithai';
import {
	escapeHtml,
	renderOrderConfirmation,
	renderCheckoutReminder,
	renderShippingNotification,
	sendCheckoutReminder,
	sendOrderConfirmation,
	sendShippingNotification,
	type EmailConfig
} from './email.ts';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || detail === undefined ? '' : ` — ${String(detail)}`}`);
	if (!cond) failures++;
}

const order: Order = {
	orderNumber: 'CMP-TEST1',
	customerId: 1,
	email: 'buyer@example.com',
	status: 'paid',
	subtotalCents: 9800,
	shippingCents: 0,
	discountCents: 1500,
	totalCents: 8300,
	currency: 'USD',
	shipping: {
		firstName: 'Ana <b>',
		lastName: 'Smith',
		phone: null,
		address1: '1 Main St',
		address2: null,
		city: 'Austin',
		province: 'TX',
		postalCode: '78701',
		country: 'US',
		method: 'standard'
	},
	items: [{ sku: 'DLJ-BLUE-M', title: 'Dog Life Jacket', options: ['Blue', 'M', null], quantity: 2, unitPriceCents: 4900 }]
};

const config: EmailConfig = {
	apiKey: 're_test',
	from: 'ChillMyPet <orders@chillmypet.com>',
	replyTo: 'contact.chillmypet@gmail.com',
	endpoint: 'http://mock.invalid/emails',
	origin: 'https://chillmypet.com'
};

// --- rendering -------------------------------------------------------------
const { subject, html, text } = renderOrderConfirmation(order, config.origin);
check('subject names the order', subject.includes('CMP-TEST1'));
check('customer text is escaped in the HTML', html.includes('Ana &lt;b&gt;') && !html.includes('Ana <b>'));
check('line total is quantity × unit price', html.includes('$98.00') && text.includes('$98.00'));
check('discount is shown when there is one', text.includes('Bundle discount: −$15.00'));
check('free shipping reads Free', text.includes('Shipping: Free'));
check('total matches the order', text.includes('Total: $83.00'));
check('null options are dropped from the item label', text.includes('Dog Life Jacket — Blue — M ') );
check('receipt link carries the order number', text.includes('https://chillmypet.com/checkout/success?order=CMP-TEST1'));
check('no "undefined" or "null" leaks into the email', !/undefined|null/.test(text) && !/>\s*(undefined|null)\s*</.test(html));
check('escapeHtml covers quotes', escapeHtml(`"'`) === '&quot;&#39;');

// --- sending ---------------------------------------------------------------
type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const ok = (async (url: string, init: RequestInit) => {
	calls.push({ url, init });
	return new Response('{"id":"em_1"}', { status: 200 });
}) as unknown as typeof fetch;

check('no API key: nothing is sent', (await sendOrderConfirmation({ ...config, apiKey: undefined }, order, ok)) === 'not_configured' && calls.length === 0);

check('with a key it sends', (await sendOrderConfirmation(config, order, ok)) === 'sent');
const sent = calls[0];
const body = JSON.parse(String(sent.init.body));
const headers = sent.init.headers as Record<string, string>;
check('to the configured endpoint', sent.url === config.endpoint);
check('to the customer', body.to?.[0] === 'buyer@example.com');
check('from the store address', body.from === config.from);
check('replies go to support', body.reply_to === 'contact.chillmypet@gmail.com');
check('authorised with the key', headers.authorization === 'Bearer re_test');
check('idempotency key is the order number', headers['idempotency-key'] === 'order-confirmation/CMP-TEST1');

const rejected = (async () => new Response('bad', { status: 422 })) as unknown as typeof fetch;
const origError = console.error;
console.error = () => {};
check('a rejected send reports failed, not a throw', (await sendOrderConfirmation(config, order, rejected)) === 'failed');
const throwing = (async () => {
	throw new Error('network down');
}) as unknown as typeof fetch;
check('a network error reports failed, not a throw', (await sendOrderConfirmation(config, order, throwing)) === 'failed');
console.error = origError;

// --- shipping notification -----------------------------------------------
const shipped = renderShippingNotification(
	order,
	{ carrier: 'Canada Post', trackingNumber: '7023 <x>', trackingUrl: 'https://track.example/?n=1&m=2' },
	config.origin
);
check('shipping subject names the order', shipped.subject.includes('CMP-TEST1') && /on its way/.test(shipped.subject));
check('tracking is in the text', shipped.text.includes('Tracking: Canada Post 7023 <x>'));
check('tracking is escaped in the HTML', shipped.html.includes('7023 &lt;x&gt;'));
check('tracking link is attribute-escaped', shipped.html.includes('href="https://track.example/?n=1&amp;m=2"'));
const bare = renderShippingNotification(order, { carrier: null, trackingNumber: null, trackingUrl: null }, config.origin);
check('no tracking, no tracking line', !bare.text.includes('Tracking') && !bare.html.includes('Track your package'));
check('no "undefined" or "null" in a bare shipping email', !/undefined|null/.test(bare.text));

calls.length = 0;
check(
	'shipping email sends',
	(await sendShippingNotification(config, order, { carrier: null, trackingNumber: '1', trackingUrl: null }, ok)) === 'sent'
);
check(
	'with its own idempotency key, so it is not dropped as the confirmation',
	(calls[0]?.init.headers as Record<string, string>)?.['idempotency-key'] === 'shipped/CMP-TEST1'
);

// --- abandoned-checkout reminder -------------------------------------------
const token = 'ab'.repeat(24);
const reminder = {
	to: 'holly@example.com',
	token,
	firstName: 'Holly <i>',
	currency: 'USD',
	christmasMessage: '🎄 Order by Monday, Dec 7 for Christmas delivery to the US',
	lines: [
		{ title: 'Dog Christmas Tree Costume', options: ['Red', 'M'], quantity: 2, unitPriceCents: 2850, imageUrl: 'https://chillmypet.com/products/x.jpg?a=1&b=2' }
	]
};
const nudge = renderCheckoutReminder(reminder, config.origin);
check('reminder greets by name, escaped', nudge.html.includes('Hi Holly &lt;i&gt;,') && !nudge.html.includes('Holly <i>'));
check('reminder subject names the cart', nudge.subject === 'Your order is still in your cart 🎄');
check('one item reads as its title', renderCheckoutReminder({ ...reminder, lines: [{ ...reminder.lines[0], quantity: 1 }] }, config.origin).subject === 'Dog Christmas Tree Costume is still in your cart 🎄');
check('no Christmas line after the cut-off, and no tree in the subject', (() => {
	const late = renderCheckoutReminder({ ...reminder, christmasMessage: null }, config.origin);
	return !late.text.includes('Christmas delivery') && !late.subject.includes('🎄');
})());
check('reminder lists the line with options and total', nudge.text.includes('2 × Dog Christmas Tree Costume — Red — M  $57.00') && nudge.text.includes('Subtotal: $57.00'));
check('restore link carries the token', nudge.text.includes(`https://chillmypet.com/checkout/restore/${token}`) && nudge.html.includes(`/checkout/restore/${token}`));
check('unsubscribe link carries the token', nudge.text.includes(`https://chillmypet.com/email/unsubscribe/${token}`));
check('image URL is attribute-escaped', nudge.html.includes('src="https://chillmypet.com/products/x.jpg?a=1&amp;b=2"'));
check('without a name it still greets', renderCheckoutReminder({ ...reminder, firstName: null }, config.origin).text.startsWith('Hi there,'));
check('no "undefined" or "null" in a reminder', !/undefined|null/.test(nudge.text) && !/>\s*(undefined|null)\s*</.test(nudge.html));

calls.length = 0;
check('no API key: no reminder is sent', (await sendCheckoutReminder({ ...config, apiKey: undefined }, reminder, ok)) === 'not_configured' && calls.length === 0);
check('reminder sends', (await sendCheckoutReminder(config, reminder, ok)) === 'sent');
const nudgeBody = JSON.parse(String(calls[0].init.body));
check('reminder goes to the draft address', nudgeBody.to?.[0] === 'holly@example.com');
check('reminder is keyed on the token, so a retried sweep cannot send it twice', (calls[0].init.headers as Record<string, string>)['idempotency-key'] === `checkout-reminder/${token}`);
check('reminder offers the mail client an unsubscribe', nudgeBody.headers?.['List-Unsubscribe'] === `<https://chillmypet.com/email/unsubscribe/${token}>`);
check('order emails carry no List-Unsubscribe', (calls.length = 0, await sendOrderConfirmation(config, order, ok), JSON.parse(String(calls[0].init.body)).headers === undefined));

if (failures) {
	console.log(`\n${failures} email check(s) failed.`);
	process.exit(1);
}
console.log('\nAll email checks passed.');
