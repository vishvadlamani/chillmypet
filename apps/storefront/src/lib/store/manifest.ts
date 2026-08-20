import type { FunnelDefinition } from '@funnel/core';

/**
 * The store page. Starts at the top and grows downward, one block at a time.
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
			id: 'urgency-timer',
			component: 'countdown',
			version: 1,
			props: {
				// `{month}` is substituted at render. Typing "August" here is the one
				// mistake this page has already made once.
				headline: '🔥 {month} sale ends in',
				uppercase: true,
				variant: 'chips',
				size: 'md',
				// Singular reads as a unit label; "Mins" reads as a word.
				labels: { mins: 'Min', secs: 'Sec' },
				// Per-visitor window, not a shared deadline: a month-long sale with a
				// nine-minute clock on it is an evergreen timer, and it persists
				// through the host so a reload doesn't hand out a fresh 15 minutes.
				durationMinutes: { $ref: 'offer.urgencyMinutes' },
				bg: '#1a1a1a',
				fg: '#ffffff',
				digitColor: '#f5c518',
				chipBg: '#2e2e2e',
				onExpire: 'restart'
			}
		},
		{
			id: 'offer-strip',
			component: 'announcement_bar',
			version: 1,
			props: {
				message: '🎁 Today only: {discount}% off + free shipping 🚚',
				vars: { discount: { $ref: 'offer.discountPct' } },
				uppercase: true,
				tracking: 'normal',
				size: 'md',
				weight: 'medium',
				bg: '#f2e34c',
				fg: '#1a1a1a'
			}
		},
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
					{ icon: '🐾', text: 'Perfect for **non-swimmers & senior dogs**' },
					{ icon: '🌊', text: 'Chin rest keeps their **head above water**' },
					{ icon: '🤝', text: 'Reinforced handle for **quick lift-outs**' },
					{ icon: '💨', text: 'Quick-dry — ready again the next day' }
				]
			}
		},
		{
			id: 'bundle-picker',
			component: 'bundles',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// No tiers, no picker — better than an empty box where the price goes.
			requires: ['bundles.tiers'],
			props: {
				heading: 'Bundle & Save',
				tiers: { $ref: 'bundles.tiers' },
				addons: { $ref: 'bundles.addons' },
				options: { $ref: 'bundles.colours' },
				optionLabel: 'Colour',
				addonPlacement: 'below',
				// "Buy now", not "Add to cart": this goes straight to /store/checkout
				// and no cart page exists. The submitted ACTION stays `add_to_cart`
				// — that's the host contract and the standard pixel event, and tying
				// it to button copy would break attribution on the first copy test.
				cta: 'Buy now',
				accent: '#2f3d24',
				width: 'full'
			}
		},
		{
			id: 'pay-badges',
			component: 'payment_badges',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// Cards only, because that is what the checkout takes — the Stripe
			// payment method configuration for this store is card-only, so a PayPal
			// or Google Pay badge here promises a button that isn't on the next
			// page. Add them back to both places together, never to one.
			props: { methods: ['visa', 'mastercard', 'amex', 'discover'], width: 'full' }
		},
		{
			id: 'stock-bar',
			component: 'stock_progress',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['stock.soldPct'],
			props: {
				// `label` and the icon are the block's own defaults — "{month} Stock",
				// computed, so it never reads August in September.
				sold: { $ref: 'stock.soldPct' },
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
						label: 'When will I get my order? 🚚',
						body: 'Please allow us 2–4 business days to process your order.\n\nOnce processed, 93% of orders arrive between 5–12 days later.\n\nIf you have any questions, please contact us at contact@chillmypet.com.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'What if the size doesn’t fit my dog? 📏',
						body: 'We offer 30 day — no questions asked — free exchanges and returns.\n\nIf you have any questions or would like to begin an exchange, please email us at contact@chillmypet.com.',
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
		{
			id: 'rule-after-hero',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		// ── FAQ: two blocks, not one. `heading` already exists and does this job
		//    better than a heading prop bolted onto every block that might want one.
		{
			id: 'faq-heading',
			component: 'heading',
			version: 1,
			props: { text: 'Frequently asked questions', level: 2, size: 'lg', width: 'shell' }
		},
		{
			id: 'faq',
			component: 'accordion',
			version: 1,
			props: {
				divided: true,
				// `shell`, not `full`: it has to line up with the hero above it, and
				// `full` means the window, which is 140px wider at this viewport.
				width: 'shell',
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
						body: 'No problem — reach out to our team and we’ll help you exchange for the correct size, hassle-free.'
					}
				]
			}
		},
		{
			id: 'guarantee',
			component: 'guarantee',
			version: 1,
			props: {
				image: '/guarantee-30day.webp',
				// Was "500+ dogs already have theirs", beside "hundreds of owners" —
				// numbers nobody counted. The guarantee itself is real: it's the
				// refund policy at /policies/refunds, word for word.
				eyebrow: 'Backed for 30 days',
				body: 'It’s not just a life jacket — it’s the piece of kit you don’t get in the water without. Shop with total confidence: you’re covered by our **Ironclad 30-Day Guarantee**. If you don’t absolutely love it, or if it arrives damaged, we’ll refund your money immediately. No questions asked. **100% risk-free.**',
				align: 'center',
				width: 'article'
			}
		},
		{
			id: 'rule-after-faq',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'review-wall-heading',
			component: 'heading',
			version: 1,
			// Heading and rule follow the wall they introduce, or the page keeps a
			// "What owners are saying" section with nothing under it.
			requires: ['reviews.featured'],
			props: { text: 'What owners are saying', level: 2, size: 'lg', width: 'shell' }
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
				tiers: { $ref: 'bundles.tiers' },
				selectionField: 'bundle',
				// Fallbacks, used only if the picker is absent (single-SKU page).
				image: { $ref: 'product.image' },
				alt: { $ref: 'product.alt' },
				title: { $ref: 'product.title' },
				price: { $ref: 'product.price' },
				compareAt: { $ref: 'product.compareAt' },
				cta: 'Buy now',
				accent: '#1d64f2'
			}
		}
	]
};
