/*
 * The only file to edit.
 *
 * paymentLink — the Stripe Payment Link (plink_1ULsvvJOsB1nguzlWIBkKc0K on the
 *               Milligram account). Its redirect expects this folder to be
 *               served at https://chillmypet-hoodie.pages.dev.
 * pixelIds    — the same three pixels chillmypet.com initialises. One
 *               fbq('track') reports to every one of them, exactly as the store
 *               does. Remove any you don't want measuring this page.
 */
window.HOODIE = {
	paymentLink: 'https://buy.stripe.com/3cI6oId3A9LY63AbFB1wY00',
	pixelIds: ['1341978141149107', '1363695699271757', '28272021345717397'],
	price: 55,
	currency: 'USD'
};
