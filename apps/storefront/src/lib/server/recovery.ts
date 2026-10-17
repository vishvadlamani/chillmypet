import type { Commerce } from 'ecomwithai';
import { loadChristmasDelivery } from '$lib/store/christmas';
import { sendCheckoutReminder, type EmailConfig, type ReminderLine } from './email';

/**
 * Sends the abandoned-checkout reminders that are due. The rules — one per
 * address, never after a purchase or an opt-out, never twice — live in the
 * framework's recovery module; this only turns a due draft into an email.
 *
 * Nothing schedules this on a clock. It runs:
 * - in the background of a page request, at most once per isolate every
 *   {@link SWEEP_EVERY_MS} (see `sweepSoon`), and
 * - from `/api/recovery/sweep`, which an outside scheduler can ping.
 * Running it more often than needed is harmless: `claim` lets exactly one
 * caller send each reminder, and Resend dedupes on the draft token besides.
 */

/** How long a shopper has been gone before the reminder goes. */
export const REMIND_AFTER_MINUTES = 60;
/** A cart older than this is not worth a reminder. */
export const REMIND_WITHIN_HOURS = 48;
export const SWEEP_EVERY_MS = 10 * 60_000;
const PER_SWEEP = 20;

export type SweepResult = {
	skipped?: 'not_configured' | 'throttled';
	sent: number;
	failed: number;
	purged: number;
};

/** `red` → `Red`, `santa-hat` → `Santa hat`: option codes as a person reads them. */
const pretty = (value: string) => {
	const spaced = value.replace(/[-_]+/g, ' ').trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const absolute = (url: string | null, origin: string): string | null => {
	if (!url) return null;
	try {
		const resolved = new URL(url, origin);
		return resolved.protocol === 'https:' || resolved.protocol === 'http:' ? resolved.href : null;
	} catch {
		return null;
	}
};

export async function sendDueReminders(
	commerce: Commerce,
	email: EmailConfig,
	settings: Record<string, string>,
	now: Date = new Date()
): Promise<SweepResult> {
	if (!email.apiKey) return { skipped: 'not_configured', sent: 0, failed: 0, purged: 0 };

	const { recovery, catalog } = commerce;
	const purged = await recovery.purge();
	const due = await recovery.due({
		idleMinutes: REMIND_AFTER_MINUTES,
		maxAgeHours: REMIND_WITHIN_HOURS,
		limit: PER_SWEEP
	});
	if (due.length === 0) return { sent: 0, failed: 0, purged };

	const [priced, products] = await Promise.all([
		catalog.priceVariants(due.flatMap((d) => d.lines.map((l) => l.variantId))),
		catalog.listProducts({ limit: 250 })
	]);
	const images = new Map(products.map((p) => [p.slug, p.imageUrl]));
	const christmasMessage = loadChristmasDelivery(settings, now).message ?? null;

	let sent = 0;
	let failed = 0;
	for (const draft of due) {
		const lines: ReminderLine[] = draft.lines.flatMap((line) => {
			const variant = priced.get(line.variantId);
			if (!variant) return [];
			return [
				{
					title: variant.title,
					options: variant.options.filter((o): o is string => Boolean(o)).map(pretty),
					quantity: line.quantity,
					unitPriceCents: variant.unitPriceCents,
					imageUrl: absolute(images.get(variant.productSlug) ?? null, email.origin)
				}
			];
		});

		// Claimed even when nothing in the cart is still for sale, so a cart of
		// discontinued products is settled once instead of read on every sweep.
		if (!(await recovery.claim(draft.token))) continue;
		if (lines.length === 0) continue;

		const result = await sendCheckoutReminder(email, {
			to: draft.email,
			token: draft.token,
			firstName: draft.firstName,
			lines,
			currency: priced.get(draft.lines[0].variantId)?.currency ?? commerce.store.currency,
			christmasMessage
		});
		if (result === 'sent') {
			sent += 1;
		} else {
			// Not sent, so not used up: the next sweep tries again. Resend's
			// idempotency key covers the case where it did go out after all.
			await recovery.release(draft.token);
			failed += 1;
		}
	}
	return { sent, failed, purged };
}

let lastSweep = 0;

/**
 * Starts a sweep in the background of the current request, unless this isolate
 * ran one in the last {@link SWEEP_EVERY_MS}. Never delays or fails the request.
 */
export function sweepSoon(
	commerce: Commerce,
	email: EmailConfig,
	settings: Record<string, string>,
	context: { waitUntil(promise: Promise<unknown>): void } | undefined
): boolean {
	if (!email.apiKey) return false;
	const now = Date.now();
	if (now - lastSweep < SWEEP_EVERY_MS) return false;
	lastSweep = now;
	const work = sendDueReminders(commerce, email, settings).catch((error) =>
		console.error('Checkout reminder sweep failed', error)
	);
	// Called as a method — destructuring waitUntil loses `this` and throws.
	if (context && typeof context.waitUntil === 'function') context.waitUntil(work);
	return true;
}
