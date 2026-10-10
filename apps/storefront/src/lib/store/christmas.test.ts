/**
 * The Christmas cut-off is a promise to a customer, so it is pinned two ways:
 * the config value has to match what the shipping promise actually allows, and
 * the strip has to disappear once that date has gone.
 *
 *   npm test
 */
import {
	CHRISTMAS_DELIVERY,
	SHIPPING_PROMISE,
	latestOrderDate,
	loadChristmasDelivery
} from './christmas.ts';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
	if (!ok) {
		console.log(`      expected ${JSON.stringify(expected)}`);
		console.log(`      actual   ${JSON.stringify(actual)}`);
		failures += 1;
	}
}

// --- the configured date is the promise, worst case ------------------------
check(
	'cut-off matches 4 business days + 12 days in transit before Christmas Eve',
	CHRISTMAS_DELIVERY.cutoff,
	latestOrderDate(
		CHRISTMAS_DELIVERY.arriveBy,
		SHIPPING_PROMISE.processingBusinessDays.max,
		SHIPPING_PROMISE.transitDays.max
	)
);
check('parcels do not leave on a weekend', latestOrderDate('2026-12-24', 0, 12), '2026-12-11');
check('processing skips the weekend', latestOrderDate('2026-12-24', 4, 12), '2026-12-07');

// --- the strip --------------------------------------------------------------
const at = (iso: string) => new Date(iso);

check(
	'shows the date in words',
	loadChristmasDelivery({}, at('2026-10-08T12:00:00Z')).message,
	'🎄 Order by Monday, Dec 7 for Christmas delivery to the US'
);
check(
	'still up late on the cut-off day on the west coast',
	Boolean(loadChristmasDelivery({}, at('2026-12-08T07:30:00Z')).message), // 23:30 PST on the 7th
	true
);
check(
	'gone the day after',
	loadChristmasDelivery({}, at('2026-12-08T08:30:00Z')), // 00:30 PST on the 8th
	{}
);
check(
	'a store setting moves it without a deploy',
	loadChristmasDelivery({ christmas_cutoff: '2026-12-04' }, at('2026-12-05T20:00:00Z')),
	{}
);
check(
	'a malformed setting falls back to the config value',
	loadChristmasDelivery({ christmas_cutoff: 'Dec 4' }, at('2026-12-05T20:00:00Z')).cutoff,
	'2026-12-07'
);

if (failures > 0) {
	console.log(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nAll Christmas delivery checks passed.');
