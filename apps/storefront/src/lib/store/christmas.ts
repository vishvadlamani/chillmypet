/**
 * The "order by … for Christmas delivery" strip.
 *
 * The cut-off is a config VALUE, not a computation the page runs. A date the
 * page derives on every request moves the moment someone edits the shipping
 * promise, and a promise to a customer should only move when a person decides
 * to move it. `christmas.test.ts` recomputes it from `SHIPPING_PROMISE` so the
 * two cannot drift apart without a red test.
 *
 * It can also move without a deploy, the same way the scarcity bar does:
 *
 *   insert into store_settings (store_id, key, value)
 *   values ('chillmypet', 'christmas_cutoff', '2026-12-04')
 *   on conflict (store_id, key) do update set value = excluded.value;
 *
 * Pure on purpose (no `$lib` imports) so the test runs under plain Node.
 */

/**
 * What the store promises: 2–4 business days to process, then 5–12 days in
 * transit. The policy page and the product FAQ quote the same numbers.
 */
export const SHIPPING_PROMISE = {
	processingBusinessDays: { min: 2, max: 4 },
	transitDays: { min: 5, max: 12 }
} as const;

export const CHRISTMAS_DELIVERY = {
	/** Last day a parcel can land and still be under the tree. */
	arriveBy: '2026-12-24',
	/**
	 * Last day to order, worst case on both legs of the promise:
	 *   ordered Mon 7 Dec → processed by Fri 11 Dec (4 business days)
	 *   → delivered by Wed 23 Dec (12 days in transit), a day to spare.
	 */
	cutoff: '2026-12-07',
	/**
	 * The strip stays up until the cut-off day is over here, the latest of the
	 * contiguous US time zones, so nobody in the country sees it vanish while
	 * their own calendar still reads the cut-off date.
	 */
	timeZone: 'America/Los_Angeles',
	market: 'the US'
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/**
 * The latest order date that still meets `arriveBy` when both legs run to
 * their maximum. Only the test calls this: the page reads the config value.
 */
export function latestOrderDate(
	arriveBy: string,
	processingBusinessDays: number,
	transitDays: number
): string {
	// Parcels leave on a business day, so step back to the last one that is
	// early enough for the slowest transit.
	let shipBy = addDays(toDate(arriveBy), -transitDays);
	while (isWeekend(shipBy)) shipBy = addDays(shipBy, -1);

	// Processing starts the business day after the order.
	let orderBy = shipBy;
	for (let left = processingBusinessDays; left > 0; ) {
		orderBy = addDays(orderBy, -1);
		if (!isWeekend(orderBy)) left -= 1;
	}
	return toIso(orderBy);
}

/** Today's date where the strip's clock lives, as YYYY-MM-DD. */
function today(now: Date, timeZone: string): string {
	// en-CA formats as YYYY-MM-DD, which compares correctly as a string.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export interface ChristmasDelivery {
	/**
	 * The strip's text. Undefined once the cut-off has passed, which drops the
	 * announcement block through its `requires` instead of leaving a stale date
	 * on the page.
	 */
	message?: string;
	/** The cut-off, as YYYY-MM-DD, for anything that wants the raw date. */
	cutoff?: string;
}

export function loadChristmasDelivery(
	settings: Record<string, string> = {},
	now: Date = new Date()
): ChristmasDelivery {
	const configured = settings.christmas_cutoff;
	const cutoff = configured && ISO_DATE.test(configured) ? configured : CHRISTMAS_DELIVERY.cutoff;

	if (today(now, CHRISTMAS_DELIVERY.timeZone) > cutoff) return {};

	const label = new Intl.DateTimeFormat('en-US', {
		timeZone: 'UTC',
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	}).format(toDate(cutoff));

	return {
		cutoff,
		message: `🎄 Order by ${label} for Christmas delivery to ${CHRISTMAS_DELIVERY.market}`
	};
}
