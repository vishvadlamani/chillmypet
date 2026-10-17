import type { Order } from 'ecomwithai';

/**
 * Order confirmation email, sent through Resend's HTTP API.
 *
 * Kept free of `$lib` and `$env` imports so `email.test.ts` can run it under
 * plain Node: configuration arrives as an argument, built once in
 * hooks.server.ts.
 */
export type EmailConfig = {
	/** Resend API key. Unset: nothing is sent, and nothing fails. */
	apiKey?: string;
	/** e.g. `ChillMyPet <orders@chillmypet.com>` — the domain must be verified in Resend. */
	from: string;
	replyTo?: string;
	/** Overridable so the payment test can point it at a local mock. Unset in every deployed environment. */
	endpoint?: string;
	/** Where the receipt link in the email points. */
	origin: string;
};

const DEFAULT_ENDPOINT = 'https://api.resend.com/emails';

export type SendResult = 'sent' | 'not_configured' | 'failed';

export type Shipment = {
	carrier: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
};

/**
 * Never throws and never rejects: an email provider must not be able to fail a
 * paid order. Callers dispatch this through `waitUntil`, next to the Purchase
 * event, on the same three paths that report a sale — each of which runs once
 * per sale, which is what keeps this to one email per order.
 *
 * The Idempotency-Key covers what that cannot: a Worker retried after the send
 * went out. Resend drops a repeat with the same key for 24 hours.
 */
export function sendOrderConfirmation(
	config: EmailConfig,
	order: Order,
	fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
	return send(config, order, 'order-confirmation', renderOrderConfirmation(order, config.origin), fetchImpl);
}

/** What the admin's "Mark shipped" sends. Same guarantees: never throws, once per order. */
export function sendShippingNotification(
	config: EmailConfig,
	order: Order,
	shipment: Shipment,
	fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
	return send(config, order, 'shipped', renderShippingNotification(order, shipment, config.origin), fetchImpl);
}

function send(
	config: EmailConfig,
	order: Order,
	kind: string,
	rendered: Rendered,
	fetchImpl: typeof fetch
): Promise<SendResult> {
	return deliver(config, { to: order.email, kind, ref: order.orderNumber }, rendered, fetchImpl);
}

type Rendered = { subject: string; html: string; text: string };

/** The one place an email leaves. `ref` names it in logs and, with `kind`, keys Resend's dedupe. */
async function deliver(
	config: EmailConfig,
	envelope: { to: string; kind: string; ref: string; headers?: Record<string, string> },
	{ subject, html, text }: Rendered,
	fetchImpl: typeof fetch
): Promise<SendResult> {
	const { to, kind, ref } = envelope;
	if (!config.apiKey || !to) return 'not_configured';
	try {
		const response = await fetchImpl(config.endpoint || DEFAULT_ENDPOINT, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json',
				'idempotency-key': `${kind}/${ref}`
			},
			body: JSON.stringify({
				from: config.from,
				to: [to],
				...(config.replyTo ? { reply_to: config.replyTo } : {}),
				subject,
				html,
				text,
				...(envelope.headers ? { headers: envelope.headers } : {})
			})
		});
		if (!response.ok) {
			console.error(`Email ${kind} rejected`, ref, response.status, await response.text().catch(() => ''));
			return 'failed';
		}
		return 'sent';
	} catch (error) {
		console.error(`Email ${kind} failed`, ref, error);
		return 'failed';
	}
}

export type ReminderLine = {
	title: string;
	options: string[];
	quantity: number;
	unitPriceCents: number;
	/** Absolute URL, or null to leave the photo out. */
	imageUrl: string | null;
};

/** What an abandoned-checkout reminder needs: who, what was in the cart, and the draft's token. */
export type CheckoutReminder = {
	to: string;
	token: string;
	firstName: string | null;
	lines: ReminderLine[];
	currency: string;
	/** The Christmas delivery line, while it is still true; null after the cut-off. */
	christmasMessage: string | null;
};

const reminderLinks = (token: string, origin: string) => ({
	restoreUrl: `${origin}/checkout/restore/${encodeURIComponent(token)}`,
	unsubscribeUrl: `${origin}/email/unsubscribe/${encodeURIComponent(token)}`
});

/**
 * The one reminder an abandoned checkout gets. Same guarantees as the others —
 * never throws — and keyed on the draft's token, so a sweep retried after the
 * send went out cannot send it twice. `List-Unsubscribe` lets a mail client
 * offer its own unsubscribe button, pointing at the same page as the footer.
 */
export function sendCheckoutReminder(
	config: EmailConfig,
	reminder: CheckoutReminder,
	fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
	const { unsubscribeUrl } = reminderLinks(reminder.token, config.origin);
	return deliver(
		config,
		{
			to: reminder.to,
			kind: 'checkout-reminder',
			ref: reminder.token,
			headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` }
		},
		renderCheckoutReminder(reminder, config.origin),
		fetchImpl
	);
}

export function renderCheckoutReminder(reminder: CheckoutReminder, origin: string): Rendered {
	const { lines, currency } = reminder;
	const { restoreUrl, unsubscribeUrl } = reminderLinks(reminder.token, origin);
	const hello = reminder.firstName ? `Hi ${reminder.firstName},` : 'Hi there,';
	const label = (l: ReminderLine) => [l.title, ...l.options].join(' — ');
	const subtotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
	const lead = lines.length === 1 && lines[0].quantity === 1 ? lines[0].title : 'Your order';
	const subject = reminder.christmasMessage
		? `${lead} is still in your cart 🎄`
		: `${lead} is still in your cart`;

	const text = [
		hello,
		'',
		'You left this in your cart. We saved it, so you can finish in one tap.',
		'',
		...lines.map((l) => `  ${l.quantity} × ${label(l)}  ${money(l.unitPriceCents * l.quantity, currency)}`),
		`  Subtotal: ${money(subtotal, currency)}`,
		'',
		'Free US shipping · 30-day free returns',
		...(reminder.christmasMessage ? ['', reminder.christmasMessage] : []),
		'',
		`Finish your order: ${restoreUrl}`,
		'',
		'Questions? Just reply to this email.',
		'ChillMyPet',
		'',
		"You're getting this one-time reminder because this address was entered at checkout on our site.",
		`Unsubscribe: ${unsubscribeUrl}`
	].join('\n');

	const cell = 'padding:10px 0;border-bottom:1px solid #eee;vertical-align:middle;';
	const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="font-size:22px;margin:0 0 8px;">${escapeHtml(hello)}</h1>
<p style="margin:0 0 24px;color:#555;">You left this in your cart. We saved it, so you can finish in one tap.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${lines
	.map(
		(l) =>
			`<tr>${l.imageUrl ? `<td width="72" style="${cell}"><img src="${escapeHtml(l.imageUrl)}" width="60" height="60" alt="" style="display:block;border-radius:8px;object-fit:cover;"></td>` : ''}<td style="${cell}">${l.quantity} × ${escapeHtml(label(l))}</td><td align="right" style="${cell}">${money(l.unitPriceCents * l.quantity, currency)}</td></tr>`
	)
	.join('\n')}
<tr><td colspan="${lines.some((l) => l.imageUrl) ? 2 : 1}" style="padding:10px 0;font-weight:700;">Subtotal</td><td align="right" style="padding:10px 0;font-weight:700;">${money(subtotal, currency)}</td></tr>
</table>
<p style="margin:8px 0 0;color:#555;">Free US shipping · 30-day free returns</p>
${reminder.christmasMessage ? `<p style="margin:16px 0 0;padding:12px 14px;background:#eef5f0;border-radius:8px;color:#285B43;font-weight:600;">${escapeHtml(reminder.christmasMessage)}</p>` : ''}
<p style="margin:28px 0;"><a href="${escapeHtml(restoreUrl)}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">Finish my order</a></p>
<p style="margin:0;color:#888;font-size:13px;">Questions? Just reply to this email.</p>
<p style="margin:24px 0 0;color:#aaa;font-size:12px;line-height:1.5;">You're getting this one-time reminder because this address was entered at checkout on our site. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888;">Unsubscribe</a></p>
</td></tr>
</table>
</body></html>`;

	return { subject, html, text };
}

function money(cents: number, currency: string): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Everything in the HTML that came from a customer — name, address — goes through this. */
export function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function renderOrderConfirmation(
	order: Order,
	origin: string
): { subject: string; html: string; text: string } {
	const { shipping, currency } = order;
	const receiptUrl = `${origin}/checkout/success?order=${encodeURIComponent(order.orderNumber)}`;
	const itemLabel = (i: Order['items'][number]) =>
		[i.title, ...i.options.filter((o): o is string => Boolean(o))].join(' — ');

	const addressLines = [
		`${shipping.firstName} ${shipping.lastName}`.trim(),
		shipping.address1,
		shipping.address2,
		[shipping.city, shipping.province, shipping.postalCode].filter(Boolean).join(', '),
		shipping.country
	].filter((line): line is string => Boolean(line));

	const totals: [string, string][] = [
		['Subtotal', money(order.subtotalCents, currency)],
		...(order.discountCents > 0
			? [['Bundle discount', `−${money(order.discountCents, currency)}`] as [string, string]]
			: []),
		['Shipping', order.shippingCents === 0 ? 'Free' : money(order.shippingCents, currency)],
		['Total', money(order.totalCents, currency)]
	];

	const subject = `Your ChillMyPet order ${order.orderNumber} is confirmed`;

	const text = [
		`Hi ${shipping.firstName},`,
		'',
		`Thanks for your order. We've received it and are getting it ready to ship.`,
		'',
		`Order ${order.orderNumber}`,
		...order.items.map(
			(i) => `  ${i.quantity} × ${itemLabel(i)}  ${money(i.unitPriceCents * i.quantity, currency)}`
		),
		'',
		...totals.map(([label, value]) => `${label}: ${value}`),
		'',
		'Shipping to:',
		...addressLines.map((l) => `  ${l}`),
		'',
		`View your order: ${receiptUrl}`,
		'',
		'Questions? Just reply to this email.',
		'ChillMyPet'
	].join('\n');

	const cell = 'padding:8px 0;border-bottom:1px solid #eee;';
	const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="font-size:22px;margin:0 0 8px;">Thanks for your order, ${escapeHtml(shipping.firstName)}!</h1>
<p style="margin:0 0 24px;color:#555;">We've received it and are getting it ready to ship.</p>
<p style="margin:0 0 8px;font-weight:600;">Order ${escapeHtml(order.orderNumber)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${order.items
	.map(
		(i) =>
			`<tr><td style="${cell}">${i.quantity} × ${escapeHtml(itemLabel(i))}</td><td align="right" style="${cell}">${money(i.unitPriceCents * i.quantity, currency)}</td></tr>`
	)
	.join('\n')}
${totals
	.map(
		([label, value], index) =>
			`<tr><td style="padding:6px 0;${index === totals.length - 1 ? 'font-weight:700;' : 'color:#555;'}">${label}</td><td align="right" style="padding:6px 0;${index === totals.length - 1 ? 'font-weight:700;' : ''}">${value}</td></tr>`
	)
	.join('\n')}
</table>
<p style="margin:24px 0 4px;font-weight:600;">Shipping to</p>
<p style="margin:0;color:#555;line-height:1.5;">${addressLines.map(escapeHtml).join('<br>')}</p>
<p style="margin:28px 0;"><a href="${escapeHtml(receiptUrl)}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">View your order</a></p>
<p style="margin:0;color:#888;font-size:13px;">Questions? Just reply to this email.</p>
</td></tr>
</table>
</body></html>`;

	return { subject, html, text };
}

export function renderShippingNotification(
	order: Order,
	shipment: Shipment,
	origin: string
): { subject: string; html: string; text: string } {
	const receiptUrl = `${origin}/checkout/success?order=${encodeURIComponent(order.orderNumber)}`;
	const tracking = [shipment.carrier, shipment.trackingNumber].filter(Boolean).join(' ');
	const subject = `Your ChillMyPet order ${order.orderNumber} is on its way`;

	const text = [
		`Hi ${order.shipping.firstName},`,
		'',
		`Good news — your order ${order.orderNumber} has shipped.`,
		...(tracking ? ['', `Tracking: ${tracking}`] : []),
		...(shipment.trackingUrl ? [`Track it: ${shipment.trackingUrl}`] : []),
		'',
		...order.items.map((i) => `  ${i.quantity} × ${i.title}`),
		'',
		`Your order: ${receiptUrl}`,
		'',
		'Questions? Just reply to this email.',
		'ChillMyPet'
	].join('\n');

	const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="font-size:22px;margin:0 0 8px;">Your order is on its way, ${escapeHtml(order.shipping.firstName)}!</h1>
<p style="margin:0 0 20px;color:#555;">Order ${escapeHtml(order.orderNumber)} has shipped.</p>
${tracking ? `<p style="margin:0 0 8px;"><strong>Tracking:</strong> ${escapeHtml(tracking)}</p>` : ''}
${shipment.trackingUrl ? `<p style="margin:20px 0;"><a href="${escapeHtml(shipment.trackingUrl)}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;">Track your package</a></p>` : ''}
<p style="margin:20px 0 0;color:#555;line-height:1.6;">${order.items.map((i) => `${i.quantity} × ${escapeHtml(i.title)}`).join('<br>')}</p>
<p style="margin:24px 0 0;"><a href="${escapeHtml(receiptUrl)}" style="color:#1a1a1a;">View your order</a></p>
<p style="margin:16px 0 0;color:#888;font-size:13px;">Questions? Just reply to this email.</p>
</td></tr>
</table>
</body></html>`;

	return { subject, html, text };
}
