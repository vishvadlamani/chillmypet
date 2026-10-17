/*
 * The only file to edit.
 *
 * checkout   where Buy goes: chillmypet.com's checkout for this hoodie, with
 *            the design and size chosen here (?design=red_santa&size=M).
 *            The order, the stock, the payment, the receipt and the Purchase
 *            all happen there; see the README, "How a sale flows".
 * skus       design:size → the SKU AddToCart names. The same SKUs as the
 *            variants on chillmypet.com (scripts/christmas-hoodie.js), so the
 *            add here and the purchase there name the same item.
 * cutoff     last day to order for Christmas delivery to the US. A config
 *            value, worked out by hand from the promise: 4 business days to
 *            process + 12 days in transit, worst case → Mon 7 Dec arrives by
 *            Wed 23 Dec. The strip disappears once the day is over in
 *            Los Angeles.
 * pixelIds   the same pixels chillmypet.com initialises. One fbq('track')
 *            reports to each of them once. Only add a pixel whose owner you
 *            can name: every visitor's browsing goes to each one listed.
 * video      the ad's own video, continued at the top of the page: put the
 *            file in this folder and name it here ('hero.mp4'), and the page
 *            plays it muted, looping and inline, with a button for sound.
 *            '' until then, so no visitor asks for a file that is not there;
 *            the hero is the product photo and nothing is missing. Keep the
 *            vertical cut the ad runs: a phone shows its middle, and the
 *            sound button opens the whole frame.
 * sizeChart  the supplier's measurements, one row per size, in centimetres,
 *            garment laid flat. null until they arrive, and the size guide
 *            says so instead of guessing. The README lists what to ask for.
 *            Example: [{ size: 'S', chestCm: 56, lengthCm: 68, sleeveCm: 60 }]
 * modelWears who is in the photo and what they wear, when the supplier says:
 *            "The model is 5'7\" (170 cm) and wears a size M". '' until then.
 */
window.XMAS = {
	slug: 'christmas-pouch-hoodie',
	title: 'Christmas Pouch Hoodie',
	price: 54.99,
	currency: 'USD',
	pixelIds: ['1341978141149107'],
	cutoff: '2026-12-07',
	cutoffZone: 'America/Los_Angeles',
	// blurb, tag and detail are display copy: what is on the hoodie, the tab on
	// its card's corner, and the caption of its close-up.
	designs: [
		{ code: 'red_santa', name: 'Santa Red', image: 'red_santa.jpg', thumb: 'red_santa-thumb.jpg', blurb: 'Santa and his sack, cloud ring', tag: 'Classic Santa', detail: 'Santa and his sack' },
		{ code: 'green_stocking', name: 'Stocking Green', image: 'green_stocking.jpg', thumb: 'green_stocking-thumb.jpg', blurb: 'Stocking and bow, cat-ear ring', tag: 'Cat-ear ring', detail: 'Stocking and bow' }
	],
	sizes: ['S', 'M', 'L', 'XL'],
	video: '',
	sizeChart: null,
	modelWears: '',
	checkout: 'https://chillmypet.com/products/christmas-pouch-hoodie/checkout',
	// The eight Payment Links this page used to open (plink_1UOEWYJOsB1nguzlJXtjB3lf
	// … plink_1UOEYtJOsB1nguzlezFxeKMv) are still active in Stripe and still
	// return to thank-you.html; nothing here links to them any more.
	skus: {
		'red_santa:S': 'CMP-XH-SANTA-RED-S',
		'red_santa:M': 'CMP-XH-SANTA-RED-M',
		'red_santa:L': 'CMP-XH-SANTA-RED-L',
		'red_santa:XL': 'CMP-XH-SANTA-RED-XL',
		'green_stocking:S': 'CMP-XH-STOCKING-GREEN-S',
		'green_stocking:M': 'CMP-XH-STOCKING-GREEN-M',
		'green_stocking:L': 'CMP-XH-STOCKING-GREEN-L',
		'green_stocking:XL': 'CMP-XH-STOCKING-GREEN-XL'
	}
};
