import type { FunnelDefinition } from '@funnel/core';

/**
 * The Christmas Pouch Hoodie page.
 *
 * Section order: gallery, design, size, size guide, benefits, FAQ,
 * guarantee. All copy is ours and written for this product.
 *
 * What is deliberately absent, and should stay absent:
 *   - countdowns, stock bars, "X viewing": none of them would be true
 *   - a compare-at price: the hoodie has never sold for more than $54.99
 *   - ratings and reviews: there are none yet, and `REVIEWS_ARE_REAL` is false
 *
 * Literals are authored decisions; `$ref` is anything the store knows (the
 * price, the designs in stock, the Christmas cut-off).
 */
export const CHRISTMAS_HOODIE_PAGE: FunnelDefinition = {
	id: 'christmas-pouch-hoodie',
	name: 'Christmas Pouch Hoodie — product page',
	layout: 'page',
	blocks: [
		{
			id: 'christmas-delivery',
			component: 'announcement_bar',
			version: 1,
			// No date, no strip: the loader returns nothing once the cut-off has
			// passed, and an "order by" date in the past is worse than silence.
			requires: ['christmas.message'],
			props: {
				message: { $ref: 'christmas.message' },
				size: 'sm',
				weight: 'semibold',
				tracking: 'normal',
				bg: '#1F5F3F',
				fg: '#FFFDF8'
			}
		},
		{
			id: 'gallery',
			component: 'design_gallery',
			version: 1,
			layout: { row: 'hero', col: 'left' },
			requires: ['variants.designs'],
			props: { designs: { $ref: 'variants.designs' }, title: 'Christmas Pouch Hoodie photos' }
		},
		{
			id: 'hero-title',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: { text: { $ref: 'product.title' }, level: 1, size: 'lg', weight: 'bold' }
		},
		{
			id: 'hero-points',
			component: 'bullet_list',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				size: 'sm',
				items: [
					{ icon: '🐾', text: 'A front pouch for your **cat or small dog**' },
					{ icon: '👀', text: 'A peek-out ring, so they can **watch the tree**' },
					{ icon: '🎄', text: 'Two festive designs: **Santa Red** and **Stocking Green**' }
				]
			}
		},
		{
			id: 'picker',
			component: 'design_size_picker',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// Nothing to pick, nothing to sell.
			requires: ['variants.available'],
			props: {
				designs: { $ref: 'variants.designs' },
				sizes: { $ref: 'variants.sizes' },
				available: { $ref: 'variants.available' },
				price: { $ref: 'variants.price' },
				priceNote: 'Free standard shipping',
				designLabel: 'Design',
				sizeLabel: 'Your size',
				sizeNote:
					'This is your size, not your pet’s. Pick the hoodie size you usually wear. The pouch fits one cat or small dog.',
				sizeGuideHref: '#size-guide',
				sizeGuideLabel: 'Size guide',
				sizeMissing: 'Pick your size first, then we’re good to go. 🎅',
				cta: 'Add to cart'
			}
		},
		{
			id: 'pay-badges',
			component: 'payment_badges',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// Same list as the life jacket, for the same reason: only what the
			// checkout takes. Change both together.
			props: { methods: ['visa', 'mastercard', 'amex', 'discover'], width: 'full' }
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
						label: 'When will it arrive? 🚚',
						body: 'We take 2–4 business days to pack your order. Then it’s 5–12 days on the road.\n\nOrdering for Christmas? Check the date at the top of the page.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'What if it doesn’t fit? 📏',
						body: 'You get 30 days. Exchanges and returns are free, and we send the label.\n\nJust email contact@chillmypet.com with your order number.',
						link: { label: 'Read our return policy', href: '/policies/refunds' }
					}
				]
			}
		},
		{
			id: 'size-guide',
			component: 'size_guide',
			version: 1,
			props: {
				title: 'Size guide',
				tips: [
					'Sizes are **for you, the human**. Your pet doesn’t need one.',
					'Pick your **usual hoodie size**. It’s a relaxed pullover with room in front for the pouch.',
					'Between two sizes? **Go up.** Your passenger will thank you.'
				],
				rows: { $ref: 'sizes.rows' },
				pending:
					'Exact chest and length measurements are on their way from our maker. We’ll add them here as soon as we have them.',
				contact:
					'Not sure? Email contact@chillmypet.com with your height and usual size, and we’ll help you pick.'
			}
		},
		{
			id: 'rule-after-size',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'benefits',
			component: 'benefit_cards',
			version: 1,
			props: {
				title: 'Why pets (and their people) love it',
				items: [
					{
						icon: '🤗',
						title: 'Hands-free cuddles',
						body: 'Your pet snuggles in the pouch. Your hands stay free for cocoa.'
					},
					{
						icon: '🎄',
						title: 'Front-row seat',
						body: 'The peek-out ring lets them see everything. Nosy pets approve.'
					},
					{
						icon: '📸',
						title: 'Card-ready photos',
						body: 'Matching festive looks, no costume wrestling. Say cheese.'
					},
					{
						icon: '🧤',
						title: 'Pockets for you',
						body: 'Two zip hand pockets for treats, keys and your phone.'
					}
				]
			}
		},
		{
			id: 'rule-after-benefits',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'faq-heading',
			component: 'heading',
			version: 1,
			props: { text: 'Questions, answered', level: 2, size: 'lg', width: 'shell' }
		},
		{
			id: 'faq',
			component: 'accordion',
			version: 1,
			props: {
				divided: true,
				width: 'shell',
				items: [
					{
						label: 'Which size should I order?',
						body: 'Your own size. The hoodie is for you, and the pouch is for your pet.\n\nBetween sizes? Go up for a little extra pouch room.'
					},
					{
						label: 'What pets fit in the pouch?',
						body: 'Cats and small dogs who love being held. If you carry them comfortably in your arms, they’ll likely love the pouch.\n\nBigger buddy? Email us before you order and we’ll give you an honest answer.'
					},
					{
						label: 'Will my pet stay put?',
						body: 'Most pets settle fast once they feel your warmth. Keep a hand under them for the first few rides, start short, and stay with them the whole time.\n\nNever leave a pet zipped in on their own.'
					},
					{
						label: 'Will it arrive before Christmas?',
						body: 'We take 2–4 business days to pack, then 5–12 days on the road. Order by the date in the banner at the top and it should reach a US address in time.'
					},
					{
						label: 'How do I wash it?',
						body: 'Follow the care label inside. A cold, gentle wash inside out, then air-dry, keeps it cosy for longer.'
					},
					{
						label: 'Can I return or exchange it?',
						body: 'Yes. You have 30 days to return or swap an unworn hoodie, and the return label is on us.'
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
				alt: '30-day money-back guarantee',
				eyebrow: 'Our 30-day promise',
				// Matches /policies/refunds: 30 days, unworn, free return label.
				body: 'Not quite right? Send it back unworn within **30 days** for a full refund, and we’ll cover the return label. Swapping sizes is free too. **Easy.**',
				align: 'center',
				width: 'article'
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
				cta: 'Add to cart',
				accent: '#FF6B2C',
				accentText: '#0B3C49'
			}
		}
	]
};
