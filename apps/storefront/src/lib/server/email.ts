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

/**
 * Never throws and never rejects: an email provider must not be able to fail a
 * paid order. Callers dispatch this through `waitUntil`, next to the Purchase
 * event, on the same three paths that report a sale — each of which runs once
 * per sale, which is what keeps this to one email per order.
 *
 * The Idempotency-Key covers what that cannot: a Worker retried after the send
 * went out. Resend drops a repeat with the same key for 24 hours.
 */
export async function sendOrderConfirmation(
	config: EmailConfig,
	order: Order,
	fetchImpl: typeof fetch = fetch
): Promise<SendResult> {
	if (!config.apiKey || !order.email) return 'not_configured';
	try {
		const { subject, html, text } = renderOrderConfirmation(order, config.origin);
		const response = await fetchImpl(config.endpoint || DEFAULT_ENDPOINT, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${config.apiKey}`,
				'content-type': 'application/json',
				'idempotency-key': `order-confirmation/${order.orderNumber}`
			},
			body: JSON.stringify({
				from: config.from,
				to: [order.email],
				...(config.replyTo ? { reply_to: config.replyTo } : {}),
				subject,
				html,
				text
			})
		});
		if (!response.ok) {
			console.error(
				'Order confirmation email rejected',
				order.orderNumber,
				response.status,
				await response.text().catch(() => '')
			);
			return 'failed';
		}
		return 'sent';
	} catch (error) {
		console.error('Order confirmation email failed', order.orderNumber, error);
		return 'failed';
	}
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
