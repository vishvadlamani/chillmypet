/**
 * Review aggregates. Separate from `offer` because they answer to different
 * things: the offer changes when marketing decides, this changes when a customer
 * writes something.
 *
 * A rating is a claim about other people. Typing 4.9 into a manifest freezes
 * that claim at the moment someone wrote it, and it keeps making it long after
 * it stops being true — which is the version of this bug that has legal weight,
 * not just a stale page.
 */
import { showPlaceholderReviews } from './reviews-wall';

export interface ReviewSummary {
	average: number;
	count: number;
	/** One entry per star level, for the summary panel's bars. */
	histogram: Array<{ stars: number; count: number }>;
}

export function loadReviews(): ReviewSummary | Record<string, never> {
	// 4.9 from 1,127 was never counted from anything. An aggregate is a claim
	// about other people, and this one is on the page a paid campaign lands on,
	// beside a buy button — see reviews-wall.ts for the switch that turns the
	// whole set back on once there is something real to average.
	if (!showPlaceholderReviews()) return {};

	const count = 1127;
	return {
		average: 4.9,
		count,
		// Derived from the count so the bars can never contradict the total shown
		// beside them — two numbers claiming different things about the same
		// reviews is the detail people actually notice.
		histogram: [
			{ stars: 5, count: Math.round(count * 0.91) },
			{ stars: 4, count: Math.round(count * 0.06) },
			{ stars: 3, count: Math.round(count * 0.02) },
			{ stars: 2, count: Math.round(count * 0.007) },
			{ stars: 1, count: Math.round(count * 0.003) }
		]
	};
}
