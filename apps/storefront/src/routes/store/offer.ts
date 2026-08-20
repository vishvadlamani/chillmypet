/**
 * The headline offer — the discount the page shouts, and the countdown window.
 */
import type { Commerce } from 'ecomwithai';
import type { Locale } from '$lib/i18n';
import { PRODUCT_SLUG } from './product';

export interface Offer {
	discountPct: number;
	urgencyMinutes: number;
}

/** Fallback when the store has no sale window configured. */
const DEFAULT_URGENCY_MINUTES = 15;

export async function loadOffer(
	commerce: Commerce,
	locale: Locale,
	settings: Record<string, string> = {}
): Promise<Offer> {
	const product = await commerce.catalog.getProduct(PRODUCT_SLUG, locale);

	// Derived from the real prices rather than typed in, so the strip can never
	// advertise a discount the product doesn't actually carry.
	const discountPct =
		product && product.compareAtCents
			? Math.round((1 - product.priceCents / product.compareAtCents) * 100)
			: 0;

	// Per-visitor window, persisted by the host so a reload doesn't hand out a
	// fresh countdown. Configurable per store; nothing here invents a deadline.
	const configured = Number(settings.offer_urgency_minutes);
	const urgencyMinutes =
		Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_URGENCY_MINUTES;

	return { discountPct, urgencyMinutes };
}
