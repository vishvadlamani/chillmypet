/**
 * The Halloween cut-off, pinned.
 *
 * This is date arithmetic behind a seasonal promise, which is the combination
 * that fails silently: nothing on the page looks wrong on the day it starts
 * quoting a date the warehouse cannot hit, and by the time anyone notices it is
 * November and the refunds have been issued.
 *
 *   node --experimental-strip-types tests/season.test.ts
 */
import { loadSeason, SEASON_LEAD_DAYS } from '../src/lib/store/season.ts';

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

const on = (iso: string) => new Date(`${iso}T09:00:00Z`);

// 6 calendar days to process + 12 in transit + a day of slack = October 12.
check('the lead time is the shipping promise, not a round number', SEASON_LEAD_DAYS, 19);

const autumn = loadSeason('en', on('2026-09-08'));
check('the cut-off is a date, in words', autumn.cutoffLabel, 'October 12');
check('and it counts the days honestly', autumn.daysLeft, 34);
check(
	'the clock runs to the END of the cut-off day, not its start',
	autumn.cutoffIso,
	'2026-10-12T23:59:59.999Z'
);

// The day itself still counts. Someone reading "order by October 12" on the
// 12th has that day, and a clock that expired at midnight called them late.
check('the cut-off day is still in time', loadSeason('en', on('2026-10-12')).daysLeft, 0);

// Everything seasonal on the page declares `requires` on these fields, so an
// empty object IS the behaviour: the countdown, the strip and the FAQ line all
// drop out rather than promising a date that has gone.
check('the day after, the page stops promising', loadSeason('en', on('2026-10-13')), {});
check('and it stays quiet through Halloween', loadSeason('en', on('2026-10-31')), {});
check('and after it', loadSeason('en', on('2026-11-05')), {});
check('out of season it says nothing', loadSeason('en', on('2026-06-01')), {});

// Rolls to the next Halloween rather than counting down to one that has gone.
check('next year re-arms on its own', loadSeason('en', on('2027-09-08')).cutoffLabel, 'October 12');
check(
	'and it tracks the calendar rather than assuming the same date',
	loadSeason('en', on('2028-09-08')).cutoffLabel,
	'October 12'
);

// The window opens 60 days out; a shopper in the spring gets no October date.
check('60 days out it is news', loadSeason('en', on('2026-08-13')).daysLeft, 60);
check('61 days out it is not', loadSeason('en', on('2026-08-12')), {});

// A Spanish visitor gets a Spanish date, not an English one in a Spanish page.
check('the date speaks the visitor’s language', loadSeason('es', on('2026-09-08')).cutoffLabel, '12 de octubre');

console.log(failures === 0 ? '\nThe cut-off holds.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
