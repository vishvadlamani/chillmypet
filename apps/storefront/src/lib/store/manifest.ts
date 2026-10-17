import type { FunnelDefinition } from '@funnel/core';

/**
 * The life jacket's page. Starts at the top and grows downward, one block at
 * a time.
 *
 * In the shop's tree look since 2026-10-17 (`theme: 'tree'` in `pages.ts`),
 * like the Christmas pages, and without the sales-page furniture it was
 * built with: no per-visitor countdown, no "today only" strip, no "% sold"
 * bar and no struck-through "was" prices, on the owner's instruction. A
 * countdown that restarts for every visitor and a discount off a price the
 * jacket never sold at are the claims the FTC calls deceptive. What it
 * offers now is the real price, the real quantity breaks and the promises
 * the policy pages make.
 *
 * Two rules hold for everything added here:
 *   - literals are authored decisions (copy, order, tone, colour)
 *   - `$ref` is anything the store knows and the author doesn't (numbers, dates)
 */
export const STORE_PAGE: FunnelDefinition = {
	id: 'store',
	name: 'Store — product page',
	layout: 'page',
	blocks: [
		{
			id: 'gallery',
			component: 'media',
			version: 1,
			// Left column of the product hero; the buy column is beside it and the
			// right half stays empty until `bundles` lands.
			//
			// No `span`: the row's own template carries the exact 715/537 all three
			// reference storefronts run. Twelfths can't express 55/45.
			layout: { row: 'hero', col: 'left' },
			props: {
				// Real product photos now, picked for what each one shows: full view,
				// side profile, in context, in use, then the build detail. Still
				// customer UGC rather than studio shots — good enough to sell from,
				// but a real launch wants proper photography here.
				items: [
					// The only real product shot there is — studio, on white, showing the
					// handle, buckles and reflective strips. The rest are customer
					// photos standing in until there's proper photography.
					// The catalogue's sailboat photo on the Christmas shots' warm
					// backdrop (`card-sailboat.jpg`), so the page opens on the shop's
					// colours rather than a white tile.
					{ src: '/products/dog-life-jacket/card-sailboat.jpg', alt: 'Dog life jacket in the Sailboat print, side view' },
					{ src: '/product-floatly.webp', alt: 'Dog life jacket, side view' },
					{ src: '/reviews/tile-bulldog.jpg', alt: 'Worn, full view in coral' },
					{ src: '/reviews/indoor-purple.jpg', alt: 'Side profile showing the reflective strips' },
					{ src: '/reviews/boat-merle.jpg', alt: 'Worn on a boat in ocean blue' },
					{ src: '/reviews/kayak-fawn.jpg', alt: 'In use on a kayak' },
					{ src: '/reviews/detail-zip.jpg', alt: 'Close-up of the zip and reinforced stitching' }
				],
				variant: 'gallery',
				aspect: 'square',
				thumbnails: true,
				arrows: true,
				// Fills its column — the hero row already sets the page width, and a
				// second max-width inside it would inset the gallery for no reason.
				width: 'full'
			}
		},
		// ── Right half of the hero. `bundles` and `buy_box` land after these. ──
		{
			id: 'hero-rating',
			component: 'rating_summary',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// No rating, no stars. A summary of reviews that don't exist is the
			// one thing on this page that would be a claim about other people.
			requires: ['reviews.average'],
			props: {
				variant: 'inline',
				average: { $ref: 'reviews.average' },
				total: { $ref: 'reviews.count' },
				caption: '{average} by {totalRaw}+ Pet Parents',
				align: 'left',
				width: 'full'
			}
		},
		{
			id: 'hero-title',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				text: { $ref: 'product.title' },
				level: 1,
				// 33/40 on a phone, 40/48 on desktop — measured against the live
				// storefront, which runs 39/48 at 1440.
				size: 'lg',
				weight: 'bold'
			}
		},
		{
			id: 'hero-benefits',
			component: 'bullet_list',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				// 15/20 + an 8px gap = the 28px rhythm the live storefront runs.
				size: 'sm',
				// Each line maps to an answer in the FAQ below — chin rest, handle,
				// quick-dry — so the page makes one argument instead of four.
				items: [
					{ icon: '✓', text: 'Made for **non-swimmers and senior dogs**' },
					{ icon: '✓', text: 'Chin rest keeps their **head above water**' },
					{ icon: '✓', text: 'Reinforced handle for **quick lift-outs**' },
					{ icon: '✓', text: 'Quick-dry, ready again the next day' }
				]
			}
		},
		{
			id: 'bundle-picker',
			component: 'bundles',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// No tiers, no picker — better than an empty box where the price goes.
			requires: ['bundles.plain'],
			props: {
				heading: 'Choose your bundle',
				// The tiers without a "was" total: each card says its saving in
				// words, as on the Christmas pages.
				tiers: { $ref: 'bundles.plain' },
				addons: { $ref: 'bundles.addons' },
				options: { $ref: 'bundles.colours' },
				optionLabel: 'Colour',
				addonPlacement: 'below',
				// "Buy now", not "Add to cart": this goes straight to /store/checkout
				// and no cart page exists. The submitted ACTION stays `add_to_cart`
				// — that's the host contract and the standard pixel event, and tying
				// it to button copy would break attribution on the first copy test.
				cta: 'Buy now',
				accent: '#0e8590',
				width: 'full'
			}
		},
		{
			id: 'pay-badges',
			component: 'payment_badges',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// Exactly what the checkout takes, so this list follows the Stripe
			// configuration, not taste. Read through the Stripe API on 2026-10-12:
			// ChillMP's default configuration has card, Apple Pay, Link and Klarna
			// on and Google Pay OFF (it was on under the old account, and this list
			// still promised it), and chillmypet.com is a registered Apple Pay
			// domain. A badge for a method that isn't there promises a button the
			// next page doesn't have, so change this list and that configuration
			// together, never one without the other, and keep it identical to the
			// Christmas hoodie page's. Rendered with real artwork by
			// $lib/components/PaymentIcons.svelte.
			// No Discover: Stripe does not offer it to accounts in Czechia (ChillMP).
			props: {
				methods: ['visa', 'mastercard', 'amex', 'applepay'],
				width: 'full'
			}
		},
		{
			id: 'hero-testimonial',
			component: 'testimonial',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['reviews.spotlight'],
			props: {
				items: { $ref: 'reviews.spotlight' },
				variant: 'plain',
				showRating: true,
				width: 'full'
			}
		},
		{
			id: 'hero-info',
			component: 'accordion',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				divided: true,
				exclusive: true,
				width: 'full',
				bodyWidth: 'full',
				items: [
					{
						label: 'When will I get my order?',
						body: 'Please allow us 2–4 business days to process your order.\n\nOnce processed, 93% of orders arrive between 5–12 days later.\n\nIf you have any questions, please contact us at contact.chillmypet@gmail.com.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'What if the size doesn’t fit my dog?',
						body: 'You have 30 days to return it or swap the size, and the return label is on us.\n\nTo begin an exchange, email contact.chillmypet@gmail.com with your order number.',
						link: { label: 'Read our return and exchange policy', href: '/policies/refunds' }
					}
				]
			}
		},
		// The chart graphic that came with the block library carried a
		// competitor's wordmark AND their measurements — their XL ran to 43" where
		// this jacket's runs to 36", so anyone who measured against it ordered a
		// size that doesn't fit. `/size-chart.svg` is ours: same layout, this
		// catalogue's numbers (`$lib/store/sizes.ts` has them as text), ChillMyPet
		// branding. Text in an SVG, so it stays sharp and readable at any width.
		{
			id: 'size-chart-heading',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: { text: { $ref: 'sizes.title' }, level: 3, size: 'sm', width: 'full' }
		},
		{
			id: 'size-chart',
			component: 'media',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				variant: 'single',
				// `auto` — a fixed-ratio graphic; a square crop cuts rows off it.
				aspect: 'auto',
				items: [
					{
						src: '/size-chart.svg',
						alt: 'Life jacket size chart: XS fits a 33–43 cm chest and 2–5 kg, S 43–53 cm and 5–9 kg, M 53–64 cm and 9–16 kg, L 64–76 cm and 16–27 kg, XL 76–91 cm and 27–45 kg. Measure the chest at its widest point; between sizes, size up.'
					}
				],
				width: 'full'
			}
		},
		// ── FAQ: two blocks, not one. `heading` already exists and does this job
		//    better than a heading prop bolted onto every block that might want one.
		{
			id: 'trust',
			component: 'trust_strip',
			version: 1,
			// Promises the shipping and refund policies already make, nothing more.
			props: {
				items: [
					{ icon: 'truck', text: 'Free US shipping' },
					{ icon: 'return', text: '30-day returns' },
					{ icon: 'lock', text: 'Secure checkout' },
					{ icon: 'mail', text: 'Real people reply' }
				]
			}
		},
		{
			id: 'faq-heading',
			component: 'heading',
			version: 1,
			layout: { row: 'faq', col: 'left' },
			props: { eyebrow: 'Before the first swim', text: 'Questions, answered.', level: 2 }
		},
		{
			id: 'faq',
			component: 'accordion',
			version: 1,
			layout: { row: 'faq', col: 'right' },
			props: {
				divided: true,
				width: 'full',
				items: [
					{
						label: 'Is the chin rest comfortable for smaller dogs?',
						body: 'Yes — the chin rest is designed to sit naturally under the jaw without restricting movement, and it’s proportioned across all sizes so smaller breeds get the same support as larger ones.'
					},
					{
						label: 'Will this work for a dog who’s never worn a life vest before?',
						body: 'Most dogs adjust within the first few minutes, especially once they’re in the water and feel the support. We recommend a quick 5-minute trial in shallow water before a big trip.'
					},
					{
						label: 'Can it get wet and dry quickly between uses?',
						body: 'Absolutely — the materials are quick-dry and built for repeated water use, so you can use it one day and have it ready again the next.'
					},
					{
						label: 'How do I know which size to order?',
						// Blank line renders as a paragraph break (whitespace-pre-line).
						body: 'Check our size chart based on chest girth and weight.\n\nIf your dog is between sizes, we recommend sizing up for a more comfortable, secure fit.'
					},
					{
						label: 'Is the handle strong enough to lift my dog out of water?',
						body: 'Yes — the handle is reinforced and stitched to support a quick lift-assist, ideal for getting your dog back onto a dock, boat, or shore.'
					},
					{
						label: 'What if the size doesn’t fit right when it arrives?',
						body: 'Email contact.chillmypet@gmail.com with your order number and we’ll swap it for the right size. You have 30 days, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'who-we-are-heading',
			component: 'heading',
			version: 1,
			// No reviews to show yet, so the page answers "can I trust this shop"
			// with what it promises instead, in place of the old guarantee seal.
			props: {
				eyebrow: 'Who you’re buying from',
				text: 'A small shop with a real inbox.',
				level: 2,
				width: 'page'
			}
		},
		{
			id: 'who-we-are',
			component: 'benefit_cards',
			version: 1,
			// Every line is one the contact and policy pages already make; change
			// them together (and with the Christmas pages' copies).
			props: {
				items: [
					{
						icon: 'mail',
						title: 'A real person answers',
						body: 'Email contact.chillmypet@gmail.com about a size, an order or a return. We reply within 1–2 business days.'
					},
					{
						icon: 'parcel',
						title: 'Free shipping, with tracking',
						body: 'Packed within 2–4 business days, and you get tracking when it ships. Lost on the way? We replace it or refund it.'
					},
					{
						icon: 'lock',
						title: 'Secure checkout',
						body: 'Payments are handled by Stripe. Your card number never touches our site.'
					},
					{
						icon: 'return',
						title: '30 days to change your mind',
						body: 'Send it back unworn within 30 days for a full refund. Swapping sizes is free, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'review-wall-heading',
			component: 'heading',
			version: 1,
			// Heading and rule follow the wall they introduce, or the page keeps a
			// "What owners are saying" section with nothing under it.
			requires: ['reviews.featured'],
			props: { text: 'What owners are saying', level: 2, width: 'page' }
		},
		{
			id: 'review-summary',
			component: 'rating_summary',
			version: 1,
			requires: ['reviews.histogram'],
			props: {
				average: { $ref: 'reviews.average' },
				total: { $ref: 'reviews.count' },
				histogram: { $ref: 'reviews.histogram' },
				showHistogram: true,
				align: 'left',
				width: 'shell'
			}
		},
		{
			id: 'review-wall',
			component: 'reviews',
			version: 1,
			// No reviews, no wall — an empty proof section is worse than none.
			requires: ['reviews.featured'],
			props: {
				items: { $ref: 'reviews.featured' },
				layout: 'masonry',
				columns: 3,
				// `auto` — varied heights are the point of a masonry wall, and what
				// makes it read as customer photos rather than a catalogue. The
				// height problem was the single column, not the crop.
				mediaAspect: 'auto',
				width: 'shell'
			}
		},
		// Until there are reviews to quote, the same photos run as a plain gallery:
		// no names, no stars, no words. Every one of them shows the product in the
		// water, which is a claim the pictures make themselves. `loadPhotoWall`
		// returns nothing once the reviews are real, so this section swaps itself
		// out for the wall above rather than sitting under it.
		{
			id: 'photo-wall-heading',
			component: 'heading',
			version: 1,
			requires: ['reviews.photos'],
			props: { eyebrow: 'Small dogs, big water', text: 'Out on the water.', level: 2, width: 'page' }
		},
		{
			id: 'photo-wall',
			component: 'reviews',
			version: 1,
			requires: ['reviews.photos'],
			props: {
				items: { $ref: 'reviews.photos' },
				layout: 'masonry',
				columns: 3,
				mediaAspect: 'auto',
				width: 'shell'
			}
		},
		{
			id: 'closing',
			component: 'closing_cta',
			version: 1,
			props: {
				eyebrow: 'Every dock, every boat, every lake.',
				title: 'Let them be the adventurous one.',
				cta: 'Choose their colour',
				// An in-page anchor to the bundle picker's heading, not a route.
				href: '#bundle-picker-label'
			}
		},
		{
			id: 'rule-after-reviews',
			component: 'divider',
			version: 1,
			requires: ['reviews.featured'],
			props: { width: 'shell', spacing: 'loose' }
		},
		// ── The dock. Not in the hero row: it's `fixed`, so where it sits in the
		//    array only decides paint order, not position.
		{
			id: 'dock',
			component: 'sticky_buy_bar',
			version: 1,
			// Nothing to dock if there is no product to buy.
			requires: ['product.price'],
			props: {
				// Mirrors the picker instead of restating a price. Same tier list,
				// same state key — otherwise the dock quotes $93 while the picker
				// above it sells the $85 tier.
				tiers: { $ref: 'bundles.plain' },
				selectionField: 'bundle',
				// Fallbacks, used only if the picker is absent (single-SKU page).
				image: { $ref: 'product.image' },
				alt: { $ref: 'product.alt' },
				title: { $ref: 'product.title' },
				price: { $ref: 'product.price' },
				cta: 'Buy now',
				accent: '#0e8590'
			}
		}
	]
};
