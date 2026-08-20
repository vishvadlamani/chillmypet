/**
 * The store's live offer. Everything the top bars need and nothing else — this
 * grows a field at a time as the page grows a block at a time.
 *
 * It exists so the manifest holds no numbers. A discount typed into copy is
 * correct until the first campaign change and silently wrong after it, the same
 * way "August Sale" is correct until the 1st.
 */

export interface Offer {
	/** Headline discount, in percent. */
	discountPct: number;
	/** Per-visitor urgency window for the top timer, in minutes. */
	urgencyMinutes: number;
}

export function loadOffer(): Offer {
	return {
		discountPct: 48,
		urgencyMinutes: 15
	};
}
