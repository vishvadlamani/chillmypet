/*
 * The only file to edit.
 *
 * paymentLink — your Stripe Payment Link (https://buy.stripe.com/...).
 * pixelIds    — the same three pixels chillmypet.com initialises. One
 *               fbq('track') reports to every one of them, exactly as the store
 *               does. Remove any you don't want measuring this page.
 */
window.HOODIE = {
	paymentLink: 'https://buy.stripe.com/REPLACE_WITH_YOUR_PAYMENT_LINK',
	pixelIds: ['1341978141149107', '1363695699271757', '28272021345717397'],
	price: 49,
	currency: 'USD'
};
