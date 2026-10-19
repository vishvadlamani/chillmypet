import type { FunnelDefinition } from '@funnel/core';

/**
 * The Calming Massager page.
 *
 * The Christmas pages' layout (pill picker, bundle cards, hairline
 * accordions) in the brand's skin, like the life jacket: it is not a
 * Christmas product, so `pages.ts` leaves its `christmas` flag off and the
 * layout draws it in navy, teal and DM Sans. It has no delivery strip of its
 * own; the layout's site-wide one stands in.
 *
 * One size, so the picker shows the colours and no size buttons, and there
 * is no size guide. Every word here is ours, and it claims only what the
 * photos show: the strap, the four hands, the two buttons. Nothing about
 * heat, modes, battery or health until the supplier's spec sheet is in hand.
 *
 * What is deliberately absent, as on every product page: countdowns, stock
 * bars, struck-through prices, ratings and reviews. The words say "little
 * one", never pet, dog or cat (the owner's rule, 2026-10-18).
 */
export const CALMING_MASSAGER_PAGE: FunnelDefinition = {
	id: 'calming-massager',
	name: 'Calming Massager — product page',
	layout: 'page',
	blocks: [
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
						src: '/products/calming-massager/on-the-back.jpg',
						alt: 'A Labrador lying on a rug with the khaki massager strapped across its back'
					}
				],
				hint: 'Swipe to explore',
				title: 'Calming Massager photos'
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
				// One size: the picker reads it as chosen and shows no buttons.
				sizes: { $ref: 'variants.sizes' },
				available: { $ref: 'variants.available' },
				price: { $ref: 'variants.price' },
				priceNote: 'Free shipping',
				tagline: 'A slow, **hands-free** knead, strapped on while they lie down and settle.',
				designLabel: 'Colour',
				// The store's real quantity breaks, priced by the server. Its own
				// field, so a bundle chosen on another page does not carry over.
				tiers: { $ref: 'bundles.plain' },
				tierField: 'massager_bundle',
				tiersTitle: 'Choose your bundle',
				unitsNoun: 'massagers',
				tierCopy: [
					{ units: 1, title: 'One massager • 1', tag: 'Free US shipping', sub: 'One Calming Massager', ribbon: 'Just one' },
					{ units: 2, title: 'Two massagers • 2', tag: 'Free US shipping', sub: 'Two, in the colour you pick', ribbon: 'Pair up' },
					{ units: 3, title: 'Three massagers • 3', tag: 'Free US shipping + best value', sub: 'Three, for the whole household', ribbon: 'Best value' }
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
						label: 'How it works',
						body: 'The round body sits on their back, held by an adjustable strap that buckles under the chest. Its four soft silicone hands rest on their coat and knead. Two buttons on top work it.'
					},
					{
						label: 'Shipping & delivery',
						body: 'Free standard shipping. We take 2–4 business days to pack your order, then it’s 5–12 days on the road, with tracking.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'Returns',
						body: 'You get 30 days. Returns are free, and we send the label.\n\nJust email contact.chillmypet@gmail.com with your order number.',
						link: { label: 'Read our return policy', href: '/policies/refunds' }
					},
					{
						label: 'What’s included',
						body: 'The massager and its adjustable strap, in the colour you pick.'
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
				eyebrow: 'For the end of a long day',
				title: 'A back rub, without your hands.',
				body: [
					'Some evenings they want a back rub and you want to sit down. This one straps on and does the kneading while they lie beside you.',
					'A soft fabric body, four silicone hands, and a strap that keeps it where it belongs.'
				],
				points: [
					{ title: 'Hands-free', body: 'It stays on the strap, so you can sit back with them instead of holding it.' },
					{ title: 'Soft hands', body: 'Four rounded silicone hands rest on the coat and knead.' },
					{ title: 'Two colours', body: 'Khaki or black, one size, with an adjustable strap.' }
				]
			}
		},
		{
			id: 'colours',
			component: 'photo_pair',
			version: 1,
			// The picker's two choices, in the supplier's photos.
			props: {
				eyebrow: 'Two colours.',
				title: 'Khaki or black?',
				sub: 'The same massager and strap, one size. Pick the colour above.',
				photos: [
					{ src: '/products/calming-massager/on-the-back.jpg', alt: 'The khaki massager strapped across a Labrador’s back', caption: 'Khaki' },
					{ src: '/products/calming-massager/black.jpg', alt: 'The black massager with its four soft hands', caption: 'Black' }
				],
				note: 'AI-styled images.'
			}
		},
		{
			id: 'how-to-use',
			component: 'step_list',
			version: 1,
			props: {
				title: 'Settled in a minute.',
				lead: 'A calm moment, treats nearby, one step at a time.',
				steps: [
					{ title: 'Let them sniff it', body: 'Switched off first. A treat while they look it over helps.' },
					{ title: 'Strap it on', body: 'Body on the back, strap under the chest. Snug, never tight: two fingers should fit under it.' },
					{ title: 'Start it gently', body: 'Press the button with them lying down, and stop if they’d rather not.' }
				],
				note: 'Please stay close while they wear it, and take it off before they get up to play.'
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
			// them together (the Christmas pages carry the same four).
			props: {
				items: [
					{
						icon: 'mail',
						title: 'A real person answers',
						body: 'Email contact.chillmypet@gmail.com about an order or a return. We reply within 1–2 business days.'
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
						body: 'Send it back within 30 days for a full refund, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'faq-heading',
			component: 'heading',
			version: 1,
			layout: { row: 'faq', col: 'left' },
			props: { text: 'Questions, answered.', eyebrow: 'Before you order', level: 2 }
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
						label: 'Will it fit mine?',
						body: 'It comes in one size, with an adjustable strap that buckles under the chest. Not sure? Email us their chest measurement and we’ll tell you.'
					},
					{
						label: 'What’s the difference between khaki and black?',
						body: 'Only the colour. The massager, the hands and the strap are the same.'
					},
					{
						label: 'Mine is nervous about new things. Will this work?',
						body: 'Start with it switched off, a minute or two at a time, with treats. Some settle into it right away, some need a few short tries. If it’s a firm no, you have 30 days to send it back.'
					},
					{
						label: 'How do the bundles work?',
						body: 'Two or three massagers cost less each: the saving is on each card, and it comes off at checkout. Every massager in a bundle is the colour you picked; for a mix, add each one to your cart and the saving still counts them all.'
					},
					{
						label: 'Is it safe to leave on?',
						body: 'Please stay close while they wear it. Take it off before they get up to play or when you are not watching, and keep it away from chewing.'
					},
					{
						label: 'Can I return it?',
						body: 'Yes. You have 30 days to send it back, and the return label is on us.'
					}
				]
			}
		},
		{
			id: 'closing',
			component: 'closing_cta',
			version: 1,
			props: {
				eyebrow: 'A quiet moment, together.',
				title: 'Let it do the kneading.',
				cta: 'Choose a colour',
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
				selectionField: 'massager_bundle',
				cta: 'Add to cart',
				accent: '#0b3c49',
				accentText: '#FFFFFF'
			}
		}
	]
};
