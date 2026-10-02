/*
 * The only file to edit.
 *
 * paymentLink — the Stripe Payment Link (plink_1ULu2aJOsB1nguzlIzkLcmZG on the
 *               ChillMP account). Its redirect expects this folder to be
 *               served at https://chillmypet-hoodie.pages.dev.
 * pixelIds    — the same three pixels chillmypet.com initialises. One
 *               fbq('track') reports to every one of them, exactly as the store
 *               does. Remove any you don't want measuring this page.
 * colours     — the first is the default. id goes to Stripe as
 *               client_reference_id, so keep it lowercase letters only; ?colour=
 *               on the page URL preselects one (for an ad per colour).
 */
window.HOODIE = {
	paymentLink: 'https://buy.stripe.com/fZu28sfbIgamgIe8tp1wY01',
	pixelIds: ['1341978141149107', '1363695699271757', '28272021345717397'],
	price: 49,
	currency: 'USD',
	colours: [
		{ id: 'black', name: 'Black', hex: '#1c1c1c', image: 'hoodie-black.jpg' },
		{ id: 'gray', name: 'Gray', hex: '#8c8c8c', image: 'hoodie-gray.jpg' },
		{ id: 'pink', name: 'Pink', hex: '#f0a9b8', image: 'hoodie-pink.jpg' },
		{ id: 'cream', name: 'Cream', hex: '#efe9da', image: 'hoodie-cream.jpg' }
	]
};
