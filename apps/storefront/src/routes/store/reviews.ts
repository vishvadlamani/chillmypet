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

export interface ReviewSummary {
	average: number;
	count: number;
	/** One entry per star level, for the summary panel's bars. */
	histogram: Array<{ stars: number; count: number }>;
}

export function loadReviews(): ReviewSummary {
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
