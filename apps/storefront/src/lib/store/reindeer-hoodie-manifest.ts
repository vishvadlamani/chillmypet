import type { FunnelDefinition } from '@funnel/core';

/**
 * The Reindeer Christmas Dog Hoodie page.
 *
 * The costume's page, product for product: the same `tree` theme (cream and
 * pine, Poppins, pill pickers, bundle cards, hairline accordions), styled
 * after littletreepups.com on the owner's instruction. Only the look came
 * across: every word here is ours and written for this product.
 *
 * What is deliberately absent, and should stay absent:
 *   - countdown chips, stock bars, "X viewing": none of them would be true.
 *     The one dated line is the real Christmas delivery cut-off, and it drops
 *     out by itself once the date has passed.
 *   - a struck-through price: the hoodie has never been offered at any other
 *     price, and the bundle cards state their saving in words.
 *   - ratings and reviews: there are none yet, and `REVIEWS_ARE_REAL` is
 *     false.
 *   - size measurements: the supplier's table is not in hand (see
 *     `scripts/reindeer-dog-hoodie.js`). The guide says how to measure and
 *     shows its pending note; the table appears once the catalogue has rows.
 *
 * Two photos so far, both the supplier's: the hoodie worn from the front
 * (the red colour's photo) and from behind. Each is used once.
 */
export const REINDEER_HOODIE_PAGE: FunnelDefinition = {
	id: 'reindeer-dog-hoodie',
	name: 'Reindeer Christmas Dog Hoodie — product page',
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
						src: '/products/reindeer-dog-hoodie/back.jpg',
						alt: 'The reindeer hoodie from behind: antlers on the hood and the Christmas tree patch on the back'
					}
				],
				hint: 'Swipe to explore',
				title: 'Reindeer Christmas Dog Hoodie photos'
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
				tagline: 'Santa’s smallest reindeer, ready for the Christmas photo.',
				designLabel: 'Colour',
				sizeLabel: 'Size',
				// No figures until the supplier's table is in: how to choose, not
				// what to choose.
				sizeNote: 'Sizes S to XL for small dogs. Measure chest, neck and back first; between two, go up.',
				sizeGuideHref: '#size-guide',
				sizeGuideLabel: 'Size guide',
				sizeMissing: 'Pick your dog’s size first, then we’re good to go.',
				// The store's real quantity breaks, priced by the server. Its own
				// field, so a costume bundle chosen earlier does not carry over.
				tiers: { $ref: 'bundles.plain' },
				tierField: 'reindeer_bundle',
				tiersTitle: '🎄 Choose your bundle',
				unitsNoun: 'hoodies',
				tierCopy: [
					{ units: 1, title: 'One hoodie • 1', tag: 'Free US shipping', sub: 'One reindeer hoodie', ribbon: 'Just one' },
					{ units: 2, title: 'Two hoodies • 2', tag: 'Free US shipping', sub: 'Two, in the size you pick', ribbon: 'Pair up' },
					{ units: 3, title: 'Three hoodies • 3', tag: 'Free US shipping + best value', sub: 'Three, for the whole pack', ribbon: 'Best value' }
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
						body: 'Four sizes, S to XL, for small dogs. Measure around the widest part of the chest, around the neck, and along the back from the collar to the base of the tail, then choose by those numbers rather than by breed.\n\nBetween two sizes, go up: a hoodie that is a little loose looks better than one that pulls.',
						link: { label: 'See the size guide', href: '#size-guide' }
					},
					{
						label: 'Shipping & delivery',
						body: 'Free standard shipping. We take 2–4 business days to pack your order, then it’s 5–12 days on the road, with tracking.\n\nOrder by the date in the bar at the top for Christmas delivery to the US. After the cut-off we still ship right away, but we can’t promise it lands before the 25th.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'Returns & exchanges',
						body: 'You get 30 days. Exchanges and returns are free, and we send the label.\n\nJust email contact@chillmypet.com with your order number.',
						link: { label: 'Read our return policy', href: '/policies/refunds' }
					},
					{
						label: 'What’s included & care',
						body: 'One red reindeer hoodie in the size you pick. The antlers and the tree patch are sewn on.\n\nHand wash in cool water and lay flat to dry.'
					}
				]
			}
		},
		{
			id: 'story',
			component: 'story',
			version: 1,
			props: {
				eyebrow: 'Christmas, with the dog in it',
				title: 'One of Santa’s reindeer, at a quarter of the size.',
				body: [
					'Every year there’s one photo everybody keeps. This is how your dog ends up in the middle of it.',
					'Soft red plush with fluffy white trim, two brown antlers on the hood and a little Christmas tree on the back. It reads as a reindeer from the front and as Christmas from behind.'
				],
				points: [
					{ title: 'Antlers on the hood', body: 'Soft, stitched-on antlers that stand up when the hood is on and sit on the back when it isn’t.' },
					{ title: 'A tree on the back', body: 'A green Christmas tree patch with stars, so the photo from behind is a Christmas photo too.' },
					{ title: 'Warm and soft', body: 'Plush red fleece with white sherpa trim at the hood, the sleeves and the hem.' }
				],
				image: {
					src: '/products/reindeer-dog-hoodie/back.jpg',
					alt: 'A grey poodle in the reindeer hoodie seen from behind, the Christmas tree patch on its back'
				}
			}
		},
		{
			id: 'how-it-goes-on',
			component: 'step_list',
			version: 1,
			// No photo of the buttons yet, so the steps stand on their own.
			props: {
				title: 'Dressed in a minute.',
				lead: 'Front legs in, buttons closed, hood up.',
				steps: [
					{ title: 'Front legs through the sleeves', body: 'One paw at a time, while they’re sitting.' },
					{ title: 'Close the front', body: 'White snap buttons down the chest. No zips to catch fur.' },
					{ title: 'Hood up', body: 'Antlers up for the photo, or leave the hood down on the back.' }
				],
				note: 'Please stay with your dog while they wear it, and take it off before naps and play.'
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
			// them together (the costume page carries the same four).
			props: {
				items: [
					{
						icon: '✉️',
						title: 'A real person answers',
						body: 'Email contact@chillmypet.com about a size, an order or a return. We reply within 1–2 business days.'
					},
					{
						icon: '📦',
						title: 'Free shipping, with tracking',
						body: 'Packed within 2–4 business days, and you get tracking when it ships. Lost on the way? We replace it or refund it.'
					},
					{
						icon: '🔒',
						title: 'Secure checkout',
						body: 'Payments are handled by Stripe. Your card number never touches our site.'
					},
					{
						icon: '↩️',
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
				lead: 'Sizes S to XL, for small dogs. Use a soft tape and go by the numbers, not the breed.',
				tips: [
					'**Chest:** around the widest part, just behind the front legs.',
					'**Neck:** around the base of the neck, where a collar sits.',
					'**Back:** from the base of the neck to the base of the tail.',
					'Between two sizes? Go up. A little room looks better than a hoodie that pulls.'
				],
				// Empty until the supplier's table is in the catalogue; `pending`
				// stands in for it, and says so.
				columns: { $ref: 'sizes.columns' },
				rows: { $ref: 'sizes.rows' },
				pending: 'Measurements for each size are on their way from our maker. Email us your dog’s chest, neck and back and we’ll tell you which size to pick.',
				contact:
					'Not sure? Email contact@chillmypet.com with your dog’s measurements and breed, and we’ll help you pick.'
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
						label: 'How do I pick the size?',
						body: 'Measure your dog’s chest, neck and back (the size guide shows where), then email us the three numbers if you’re unsure: we’ll match them to the maker’s chart.\n\nBetween two sizes, go up.'
					},
					{
						label: 'Will my dog keep the hood on?',
						body: 'Most do for a photo. If yours doesn’t like it, leave the hood down: the antlers sit on the back and the tree patch still shows.'
					},
					{
						label: 'How do the bundles work?',
						body: 'Two or three hoodies cost less each: the saving is on each card, and it comes off at checkout. Every hoodie in a bundle is the size you picked; for a mix of sizes, add each one to your cart and the saving still counts them all.'
					},
					{
						label: 'Will it arrive before Christmas?',
						body: 'We take 2–4 business days to pack, then 5–12 days on the road. Order by the date in the bar at the top and it should reach a US address in time.'
					},
					{
						label: 'Is it safe to leave on?',
						body: 'Please stay with your dog while they wear it. Take it off before naps, rough play, or any time you are not watching, and keep the antlers away from chewing.'
					},
					{
						label: 'Can I return or exchange it?',
						body: 'Yes. You have 30 days to return or swap an unworn hoodie, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'closing',
			component: 'closing_cta',
			version: 1,
			props: {
				eyebrow: 'This Christmas, dress the dog too.',
				title: 'Every sleigh needs a little reindeer.',
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
				selectionField: 'reindeer_bundle',
				cta: 'Add to cart',
				accent: '#285B43',
				accentText: '#FFFFFF'
			}
		}
	]
};
