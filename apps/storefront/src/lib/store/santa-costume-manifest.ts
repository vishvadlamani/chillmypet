import type { FunnelDefinition } from '@funnel/core';

/**
 * The Pet Santa Costume with Gift page.
 *
 * The reindeer hoodie's page, product for product: the same `tree` theme
 * (cream and pine, Poppins, pill pickers, bundle cards, hairline accordions),
 * styled after littletreepups.com on the owner's instruction. Only the look
 * came across: every word here is ours and written for this product.
 *
 * What is deliberately absent, and should stay absent:
 *   - countdown chips, stock bars, "X viewing": none of them would be true.
 *     The one dated line is the real Christmas delivery cut-off, and it drops
 *     out by itself once the date has passed.
 *   - a struck-through price: the costume has never been offered at any other
 *     price, and the bundle cards state their saving in words.
 *   - ratings and reviews: there are none yet, and `REVIEWS_ARE_REAL` is
 *     false.
 *   - size measurements: the supplier's table is not in hand (see
 *     `scripts/santa-costume-with-gift.js`). The guide says how to measure and
 *     shows its pending note; the table appears once the catalogue has rows.
 *
 * Two photos so far, both the supplier's: a French bulldog (the red colour's
 * photo, and the listing image an ad's link preview shows) and a ginger cat
 * in the same costume. The words say "pet", never dog or cat (the owner's
 * rule, 2026-10-18).
 */
export const SANTA_COSTUME_PAGE: FunnelDefinition = {
	id: 'santa-costume-with-gift',
	name: 'Santa Costume with Gift — product page',
	layout: 'page',
	blocks: [
		{
			id: 'christmas-delivery',
			component: 'announcement_bar',
			version: 1,
			// The tree theme lifts this message above the site header.
			requires: ['christmas.message'],
			props: {
				message: { $ref: 'christmas.message' },
				size: 'sm',
				weight: 'semibold',
				tracking: 'normal',
				bg: '#285B43',
				fg: '#FDFBF7'
			}
		},
		{
			id: 'gallery',
			component: 'design_gallery',
			version: 1,
			layout: { row: 'hero', col: 'left' },
			requires: ['variants.designs'],
			props: {
				designs: { $ref: 'variants.designs' },
				extras: [
					{
						src: '/products/santa-pet-costume/cat.jpg',
						alt: 'A ginger cat in the same Santa costume and hat, holding the present'
					}
				],
				hint: 'Swipe to explore',
				title: 'Santa Costume with Gift photos'
			}
		},
		{
			id: 'hero-title',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// The page's one h1.
			props: { text: { $ref: 'product.title' }, level: 1, size: 'lg', weight: 'bold' }
		},
		{
			id: 'picker',
			component: 'design_size_picker',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['variants.available'],
			props: {
				look: 'pills',
				designs: { $ref: 'variants.designs' },
				sizes: { $ref: 'variants.sizes' },
				available: { $ref: 'variants.available' },
				price: { $ref: 'variants.price' },
				priceNote: 'Free shipping',
				tagline: 'Santa’s little helper, present in paws, ready for the Christmas photo.',
				designLabel: 'Colour',
				sizeLabel: 'Size',
				// No figures until the supplier's table is in: how to choose, not
				// what to choose.
				sizeNote: 'Sizes S to L. Measure chest, neck and back first; between two, go up.',
				sizeGuideHref: '#size-guide',
				sizeGuideLabel: 'Size guide',
				sizeMissing: 'Pick a size first, then we’re good to go.',
				// The store's real quantity breaks, priced by the server. Its own
				// field, so a bundle chosen on another Christmas page does not
				// carry over.
				tiers: { $ref: 'bundles.plain' },
				tierField: 'santa_bundle',
				tiersTitle: 'Optional: save with a bundle',
				ctaBeforeTiers: true,
				unitsNoun: 'costumes',
				tierCopy: [
					{ units: 1, title: 'One costume • 1', tag: 'Free US shipping', sub: 'One Santa costume', ribbon: 'Just one' },
					{ units: 2, title: 'Two costumes • 2', tag: 'Free US shipping', sub: 'Two, in the size you pick', ribbon: 'Pair up' },
					{ units: 3, title: 'Three costumes • 3', tag: 'Free US shipping + best value', sub: 'Three, for the whole household', ribbon: 'Best value' }
				],
				cta: 'Add to cart',
				ctaNote: 'Secure checkout · Free standard US shipping · 30-day returns'
			}
		},
		{
			id: 'pay-badges',
			component: 'payment_badges',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// The same list as every other product page: only what the checkout
			// offers. Change them all together.
			props: { methods: ['visa', 'mastercard', 'amex', 'applepay'], width: 'full' }
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
						label: 'Size & fit',
						body: 'Three sizes, S to L. Measure around the widest part of the chest, around the neck, and along the back from the collar to the base of the tail, then choose by those numbers rather than by breed.\n\nBetween two sizes, go up: the cord at the neck takes up any slack.',
						link: { label: 'See the size guide', href: '#size-guide' }
					},
					{
						label: 'Shipping & delivery',
						body: 'Free standard shipping. We take 2–4 business days to pack your order, then it’s 5–12 days on the road, with tracking.\n\nOrder by the date in the bar at the top for Christmas delivery to the US. After the cut-off we still ship right away, but we can’t promise it lands before the 25th.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'Returns & exchanges',
						body: 'You get 30 days. Exchanges and returns are free, and we send the label.\n\nJust email contact.chillmypet@gmail.com with your order number.',
						link: { label: 'Read our return policy', href: '/policies/refunds' }
					},
					{
						label: 'What’s included & care',
						body: 'The red Santa suit in the size you pick, with its plush arms and wrapped present, and the matching Santa hat.\n\nHand wash in cool water and lay flat to dry.'
					}
				]
			}
		},
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
			id: 'story',
			component: 'story',
			version: 1,
			props: {
				eyebrow: 'Christmas, with everyone in it',
				title: 'Santa’s on his way. He’s a little shorter than you expected.',
				body: [
					'Every year there’s one photo everybody keeps. This is the one where your little one turns up with the presents.',
					'Soft red plush with fluffy white trim and a black belt, a Santa hat with a pom-pom, and two little arms out front holding a wrapped gift. From the front it looks like they are carrying it in themselves.'
				],
				points: [
					{ title: 'A present in their paws', body: 'Plush arms hold a wrapped gift out front, so it looks like they’re making the delivery.' },
					{ title: 'The whole Santa look', body: 'Red suit, white trim, black belt and a matching hat with a pom-pom.' },
					{ title: 'Three sizes, snug fit', body: 'S, M and L, with a cord at the neck to snug the fit.' }
				],
				image: {
					src: '/products/santa-pet-costume/cat.jpg',
					alt: 'A ginger cat in the Santa costume and hat, holding the green wrapped present'
				}
			}
		},
		{
			id: 'how-it-goes-on',
			component: 'step_list',
			version: 1,
			// No photo of the fastening yet, so the steps stand on their own.
			props: {
				title: 'Dressed in a minute.',
				lead: 'Suit on, cord snug, hat on.',
				steps: [
					{ title: 'Suit over the back', body: 'Lay it over their back with the present at the front, while they’re sitting.' },
					{ title: 'Snug the neck', body: 'Slide the cord toggle up until it sits like a loose collar: two fingers’ room.' },
					{ title: 'Hat on', body: 'For the photo. If they’d rather not, the suit and the present carry the look on their own.' }
				],
				note: 'Please stay close while they wear it, and take it off before naps and play.'
			}
		},
		{
			id: 'who-we-are-heading',
			component: 'heading',
			version: 1,
			// No reviews to show yet, so the page answers "can I trust this shop"
			// with what it promises instead, where a reviews wall would sit.
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
			// them together (the costume and reindeer pages carry the same four).
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
			id: 'size-guide',
			component: 'size_guide',
			version: 1,
			props: {
				look: 'band',
				eyebrow: 'Measure first, then pick',
				title: 'Find their fit.',
				lead: 'Sizes S to L. Use a soft tape and go by the numbers, not the breed.',
				tips: [
					'**Chest:** around the widest part, just behind the front legs.',
					'**Neck:** around the base of the neck, where a collar sits.',
					'**Back:** from the base of the neck to the base of the tail.',
					'Between two sizes? Go up. The cord at the neck takes up the slack.'
				],
				// Empty until the supplier's table is in the catalogue; `pending`
				// stands in for it, and says so.
				columns: { $ref: 'sizes.columns' },
				rows: { $ref: 'sizes.rows' },
				pending: 'Measurements for each size are on their way from our maker. Email us their chest, neck and back and we’ll tell you which size to pick.',
				contact:
					'Not sure? Email contact.chillmypet@gmail.com with their measurements and breed, and we’ll help you pick.'
			}
		},
		{
			id: 'faq-heading',
			component: 'heading',
			version: 1,
			layout: { row: 'faq', col: 'left' },
			props: { text: 'Questions, answered.', eyebrow: 'Before you wrap it', level: 2 }
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
						label: 'Will it fit?',
						body: 'It’s made for every shape. Measure the three places in the size guide and go by the numbers, not the breed.'
					},
					{
						label: 'How do I pick the size?',
						body: 'Measure their chest, neck and back (the size guide shows where), then email us the three numbers if you’re unsure: we’ll match them to the maker’s chart.\n\nBetween two sizes, go up.'
					},
					{
						label: 'How do the bundles work?',
						body: 'Two or three costumes cost less each: the saving is on each card, and it comes off at checkout. Every costume in a bundle is the size you picked; for a mix of sizes, add each one to your cart and the saving still counts them all.'
					},
					{
						label: 'Will it arrive before Christmas?',
						body: 'We take 2–4 business days to pack, then 5–12 days on the road. Order by the date in the bar at the top and it should reach a US address in time.'
					},
					{
						label: 'Is it safe to leave on?',
						body: 'Please stay close while they wear it. Take it off before naps, rough play, or any time you are not watching.'
					},
					{
						label: 'Can I return or exchange it?',
						body: 'Yes. You have 30 days to return or swap an unworn costume, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'closing',
			component: 'closing_cta',
			version: 1,
			props: {
				eyebrow: 'This Christmas, dress the whole family.',
				title: 'Let them deliver the presents this year.',
				cta: 'Choose their size',
				// An in-page anchor to the picker, not a route.
				href: '#variant-picker'
			}
		},
		{
			id: 'dock',
			component: 'sticky_buy_bar',
			version: 1,
			requires: ['product.price'],
			props: {
				image: { $ref: 'product.image' },
				alt: { $ref: 'product.alt' },
				title: { $ref: 'product.title' },
				price: { $ref: 'product.price' },
				// Follows the bundle card chosen in the picker.
				tiers: { $ref: 'bundles.plain' },
				selectionField: 'santa_bundle',
				cta: 'Add to cart',
				accent: '#285B43',
				accentText: '#FFFFFF'
			}
		}
	]
};
