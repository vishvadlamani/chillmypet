import { env } from '$env/dynamic/private';

/**
 * Getting a person's attention.
 *
 * Two of the webhook's events are not state changes to be recorded and moved
 * on from — they are deadlines. A dispute has a fixed window to submit
 * evidence, and an early fraud warning is only worth acting on before it
 * becomes a chargeback. Both are rare enough that nobody is watching a log for
 * them, which is exactly why writing them to one is not an alert.
 *
 * There is no transactional email in this store yet, so the channel is a
 * webhook URL: Slack and Discord both take this shape, and so does anything
 * that can be pointed at an inbox. Unset, this still logs — the log is the
 * floor, not the mechanism.
 */
export type Alert = {
	/** One line, the thing a person reads first. */
	subject: string;
	/** Everything needed to act without opening the database. */
	detail: string;
	orderNumber?: string | null;
};

/**
 * Never rejects. This runs inside `waitUntil` on a request Stripe is waiting
 * on, and a failed alert must not turn into a redelivered webhook.
 */
export async function sendAlert(alert: Alert): Promise<void> {
	const line = [alert.subject, alert.orderNumber ? `order ${alert.orderNumber}` : null, alert.detail]
		.filter(Boolean)
		.join(' · ');

	// Always, whether or not a destination is configured. `wrangler tail` and the
	// Workers logs are where this is found if the webhook is down or unset.
	console.error('[alert]', line);

	const url = env.ALERT_WEBHOOK_URL;
	if (!url) return;

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// `text` is what Slack, Discord and most webhook receivers read; the
			// rest is there for anything that parses the body properly.
			body: JSON.stringify({
				text: line,
				subject: alert.subject,
				detail: alert.detail,
				order_number: alert.orderNumber ?? null
			})
		});
		if (!response.ok) {
			console.error('Alert webhook rejected the message', response.status, line);
		}
	} catch (error) {
		console.error('Alert webhook failed', error, line);
	}
}
