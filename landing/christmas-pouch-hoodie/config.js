/*
 * The only file to edit.
 *
 * links      one Stripe Payment Link per design and size, on the ChillMP
 *            account (acct_1U3NewJOsB1nguzl). The size is chosen on this page
 *            and fixed in the link, so the sale in Stripe names exactly what
 *            to ship. Each link's metadata carries the same sku; _worker.js
 *            reports the sale with it.
 * cutoff     last day to order for Christmas delivery to the US. A config
 *            value, worked out by hand from the promise: 4 business days to
 *            process + 12 days in transit, worst case → Mon 7 Dec arrives by
 *            Wed 23 Dec. The strip disappears once the day is over in
 *            Los Angeles.
 * pixelIds   the same pixels chillmypet.com initialises. One fbq('track')
 *            reports to each of them once.
 */
window.XMAS = {
	slug: 'christmas-pouch-hoodie',
	title: 'Christmas Pouch Hoodie',
	price: 54.99,
	currency: 'USD',
	pixelIds: ['1341978141149107', '1363695699271757', '28272021345717397'],
	cutoff: '2026-12-07',
	cutoffZone: 'America/Los_Angeles',
	designs: [
		{ code: 'red_santa', name: 'Santa Red', image: 'red_santa.jpg', thumb: 'red_santa-thumb.jpg' },
		{ code: 'green_stocking', name: 'Stocking Green', image: 'green_stocking.jpg', thumb: 'green_stocking-thumb.jpg' }
	],
	sizes: ['S', 'M', 'L', 'XL'],
	// design:size → { sku, url }. Payment Links plink_1UOEWYJOsB1nguzlJXtjB3lf
	// (Santa Red S) through plink_1UOEYtJOsB1nguzlezFxeKMv (Stocking Green XL).
	links: {
		'red_santa:S': { sku: 'CMP-XH-SANTA-RED-S', url: 'https://buy.stripe.com/dRm6oI2oW2jw2Ro6lh1wY02' },
		'red_santa:M': { sku: 'CMP-XH-SANTA-RED-M', url: 'https://buy.stripe.com/aFa4gA9Ro1fs77E8tp1wY03' },
		'red_santa:L': { sku: 'CMP-XH-SANTA-RED-L', url: 'https://buy.stripe.com/cNi6oI0gO3nAgIecJF1wY04' },
		'red_santa:XL': { sku: 'CMP-XH-SANTA-RED-XL', url: 'https://buy.stripe.com/cNidRa2oW1fs4ZwfVR1wY05' },
		'green_stocking:S': { sku: 'CMP-XH-STOCKING-GREEN-S', url: 'https://buy.stripe.com/8x2dRae7EaQ23Vs8tp1wY06' },
		'green_stocking:M': { sku: 'CMP-XH-STOCKING-GREEN-M', url: 'https://buy.stripe.com/3cIeVe8Nk8HUfEa10X1wY07' },
		'green_stocking:L': { sku: 'CMP-XH-STOCKING-GREEN-L', url: 'https://buy.stripe.com/aFa6oI4x49LY8bIdNJ1wY08' },
		'green_stocking:XL': { sku: 'CMP-XH-STOCKING-GREEN-XL', url: 'https://buy.stripe.com/14A5kE0gOaQ2gIeaBx1wY09' }
	}
};
