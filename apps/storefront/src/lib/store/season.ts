/**
 * The Halloween order-by date.
 *
 * A costume is worth nothing on November 1st, which makes this the one product
 * on the store with a real deadline — so it gets a real one. The date below is
 * worked back from the shipping promise the FAQ already makes (2–4 business
 * days to process, then 5–12 days in transit) rather than picked to look
 * urgent, and everything that renders it declares `requires` on these fields.
 * Past the cut-off they all drop out by themselves: no countdown to a date that
 * has gone, and no page still promising October 31st in November.
 *
 * That is the opposite trade from the evergreen 15-minute timer on the life
 * jacket, and deliberately so. An invented deadline next to a genuine one
 * devalues the genuine one, and this deadline is the single most useful fact
 * on the page — it is also what stops a wave of "where is it" emails and
 * chargebacks in the first week of November.
 */
import type { Locale } from '$lib/i18n';

export interface Season {
	/** ISO instant the countdown block counts down to. */
	cutoffIso: string;
	/** The same moment as prose — "October 12" — in the visitor's language. */
	cutoffLabel: string;
	/** Whole days left, for copy that reads better as a number than a clock. */
	daysLeft: number;
}

/**
 * Worst case, not average, because the promise has to hold for the last order
 * accepted — an average cut-off is wrong for half the people who trust it.
 *
 * These numbers are the same ones the shipping FAQ and /policies/shipping
 * state. If the warehouse gets slower, they change here and the date moves on
 * its own; change the prose alone and the page promises a date nobody can hit.
 */
const PROCESSING_DAYS_MAX = 4; // business days
/** 4 business days spans a weekend in the worst case, so 6 on the calendar. */
const PROCESSING_CALENDAR_DAYS = 6;
const TRANSIT_DAYS_MAX = 12; // calendar days
/** Land it the day before, so a costume for the 31st is not delivered on it. */
const SLACK_DAYS = 1;

const LEAD_DAYS = PROCESSING_CALENDAR_DAYS + TRANSIT_DAYS_MAX + SLACK_DAYS;

/**
 * How early the deadline starts being news. Outside this window a shopper in
 * March gets an October date next to the buy button, which reads as a page
 * nobody maintains rather than as urgency.
 */
const VISIBLE_DAYS_BEFORE = 60;

const DAY_MS = 86_400_000;

/** October 31st, in UTC. Slack absorbs the few hours of timezone error. */
function halloween(year: number): number {
	return Date.UTC(year, 9, 31);
}

export function loadSeason(
	locale: Locale,
	now: Date = new Date()
): Season | Record<string, never> {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	// Past this year's Halloween the next one is the deadline that matters —
	// which the visibility window then keeps hidden until the autumn.
	const target = today > halloween(now.getUTCFullYear())
		? halloween(now.getUTCFullYear() + 1)
		: halloween(now.getUTCFullYear());

	const cutoff = target - LEAD_DAYS * DAY_MS;
	const daysLeft = Math.round((cutoff - today) / DAY_MS);
	if (daysLeft < 0 || daysLeft > VISIBLE_DAYS_BEFORE) return {};

	return {
		// End of the cut-off day, not its start: someone reading "order by
		// October 12" has all of the 12th, and a clock that hits zero at
		// midnight-into-the-12th calls them late a day early.
		cutoffIso: new Date(cutoff + DAY_MS - 1).toISOString(),
		cutoffLabel: new Intl.DateTimeFormat(locale, {
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(cutoff)),
		daysLeft
	};
}

/** Exported for the tests, which pin the arithmetic rather than restating it. */
export const SEASON_LEAD_DAYS = LEAD_DAYS;
export const SEASON_PROCESSING_DAYS_MAX = PROCESSING_DAYS_MAX;
