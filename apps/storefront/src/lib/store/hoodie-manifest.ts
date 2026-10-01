import type { FunnelDefinition } from '@funnel/core';

export const HOODIE_SLUG = 'pouch-pet-hoodie';

/**
 * The Pouch Pet Hoodie page. The owner wears it; the pouch is for the pet.
 *
 * Deliberately quieter than the life jacket's page, because every block left
 * out here would be a claim this product can't back yet:
 *   - no countdown or "% off" strip — there is no sale, and no compare-at price
 *     for one to be computed from
 *   - no scarcity bar — it is a marketing number, and a launch has sold nothing
 *   - no ratings or reviews — there are none
 *   - no size chart — the store has no manufacturer measurements for this
 *     garment. Add a `specs.size_chart` metafield and the two chart blocks from
 *     `manifest.ts`, not a table typed in here.
 *
 * English only, by the owner's call.
 */
export const HOODIE_PAGE: FunnelDefinition = {
	id: 'pouch-pet-hoodie',
	name: 'Pouch Pet Hoodie — product page',
	layout: 'page',
	blocks: [
		{
			id: 'offer-strip',
			component: 'announcement_bar',
			version: 1,
			props: {
				// True of every order: the standard rate is free.
				message: 'Free standard shipping 🚚 30-day returns',
				uppercase: true,
				tracking: 'normal',
				size: 'md',
				weight: 'medium',
				bg: '#f3d9df',
				fg: '#1a1a1a'
			}
		},
		{
			id: 'gallery',
			component: 'media',
			version: 1,
			layout: { row: 'hero', col: 'left' },
			props: {
				// Same paths the catalogue seeds as each colour's photo, so the
				// picker, the dock and the gallery show one image per colour.
				items: [
					{ src: '/products/pouch-pet-hoodie/lotus.jpg', alt: 'Pouch Pet Hoodie in Lotus' },
					{ src: '/products/pouch-pet-hoodie/black.jpg', alt: 'Pouch Pet Hoodie in Black' }
				],
				variant: 'gallery',
				aspect: 'square',
				thumbnails: true,
				arrows: true,
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
				size: 'sm',
				items: [
					{ icon: '🐾', text: 'A front pouch made for **cats & small dogs**' },
					{ icon: '🛋️', text: 'Keeps them close while **you get on with your day**' },
					{ icon: '👕', text: 'Still **your favourite hoodie** when they hop out' },
					{ icon: '🎨', text: '**Lotus** or **Black**, sizes XS–XL' }
				]
			}
		},
		{
			id: 'bundle-picker',
			component: 'bundles',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['bundles.tiers'],
			props: {
				heading: 'Choose yours',
				tiers: { $ref: 'bundles.tiers' },
				addons: { $ref: 'bundles.addons' },
				// One dropdown per hoodie, each a colour AND a size — the host
				// refuses to buy until every one is chosen. The id `bundle-picker`
				// is what the host focuses when it sends someone back to choose.
				options: { $ref: 'bundles.colours' },
				optionLabel: 'Colour & size (your size, not your pet’s)',
				addonPlacement: 'below',
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
						label: 'When will I get my order? 🚚',
						body: 'Please allow us 2–4 business days to process your order.\n\nOnce processed, 93% of orders arrive between 5–12 days later.\n\nIf you have any questions, please contact us at contact@chillmypet.com.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'What if it doesn’t fit? 📏',
						body: 'We offer 30 day — no questions asked — free exchanges and returns.\n\nIf you have any questions or would like to begin an exchange, please email us at contact@chillmypet.com.',
						link: { label: 'Read our return and exchange policy', href: '/policies/refunds' }
					}
				]
			}
		},
		{
			id: 'rule-after-hero',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
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
				width: 'shell',
				items: [
					{
						label: 'Who wears it — me or my pet?',
						body: 'You do. The hoodie is sized for you, and the pouch at the front is where your cat or small dog rides.'
					},
					{
						label: 'Which size should I order?',
						body: 'Order the size you normally wear in a hoodie — XS to XL.\n\nIf you’re between sizes, size up: a little extra room makes the pouch easier for your pet to settle into.'
					},
					{
						label: 'Can I wear it without my pet?',
						body: 'Of course. When they hop out, it’s a regular pullover hoodie.'
					},
					{
						label: 'What colours does it come in?',
						body: 'Lotus and Black, in every size from XS to XL.'
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
				// The refund policy at /policies/refunds, not a new promise.
				eyebrow: 'Backed for 30 days',
				body: 'Shop with total confidence: you’re covered by our **30-Day Guarantee**. If you don’t love it, or if it arrives damaged, we’ll refund your money. No questions asked.',
				align: 'center',
				width: 'article'
			}
		},
		// Fixed to the viewport, so its place in the array only sets paint order.
		{
			id: 'dock',
			component: 'sticky_buy_bar',
			version: 1,
			requires: ['product.price'],
			props: {
				tiers: { $ref: 'bundles.tiers' },
				selectionField: 'bundle',
				image: { $ref: 'product.image' },
				alt: { $ref: 'product.alt' },
				title: { $ref: 'product.title' },
				price: { $ref: 'product.price' },
				compareAt: { $ref: 'product.compareAt' },
				// The dock carries the tier but not the sizes chosen in the picker,
				// so it cannot buy a hoodie. It sends the visitor up to choose.
				action: 'choose_options',
				cta: 'Choose your size',
				accent: '#1d64f2'
			}
		}
	]
};
