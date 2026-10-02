/*
 * The only file to edit.
 *
 * paymentLink — the Stripe Payment Link (plink_1ULu2aJOsB1nguzlIzkLcmZG on the
 *               Milligram account). Its redirect expects this folder to be
 *               served at https://chillmypet-hoodie.pages.dev.
 * pixelIds    — the same three pixels chillmypet.com initialises. One
 *               fbq('track') reports to every one of them, exactly as the store
 *               does. Remove any you don't want measuring this page.
 */
window.HOODIE = {
	paymentLink: 'https://buy.stripe.com/fZu28sfbIgamgIe8tp1wY01',
	pixelIds: ['1341978141149107', '1363695699271757', '28272021345717397'],
	price: 49,
	currency: 'USD'
};
