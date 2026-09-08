import type { FunnelDefinition } from '@funnel/core';

/**
 * The Halloween costume page.
 *
 * Same shape as `STORE_PAGE`, three deliberate differences:
 *
 *  1. The countdown counts to a REAL date. The life jacket runs an evergreen
 *     15-minute window because it has no deadline to point at; this product has
 *     one — the last day an order can be placed and still arrive before October
 *     31st, worked back from the shipping promise in `$lib/store/season.ts`. An
 *     invented clock beside a genuine one devalues the genuine one, and the
 *     genuine one is the most useful sentence on the page. Past the cut-off
 *     every seasonal block here drops out on its own.
 *
 *  2. No scarcity bar. `stock.soldPct` is one store-wide marketing number, set
 *     for a product with a sales history. This one has sold nothing, and "70%
 *     sold" on it would not be a display choice, it would be a number about
 *     this product that nobody can stand behind.
 *
 *  3. No reviews, no rating, no testimonial. A product launched today has none,
 *     and the jacket's are not this costume's even after `REVIEWS_ARE_REAL`
 *     flips. When there are real ones, add the blocks from `manifest.ts` —
 *     they all declare `requires`, so they stay off until the data is there.
 */
export const HALLOWEEN_PAGE: FunnelDefinition = {
	id: 'halloween',
	name: 'Store — Grim Reaper rider costume',
	layout: 'page',
	blocks: [
		{
			id: 'cutoff-timer',
			component: 'countdown',
			version: 1,
			// No deadline, no clock. Off-season this is the whole seasonal
			// apparatus removing itself rather than counting down to last October.
			requires: ['season.cutoffIso'],
			props: {
				headline: { $ref: 'copy.cutoffHeadline' },
				uppercase: true,
				variant: 'chips',
				size: 'md',
				labels: { mins: 'Min', secs: 'Sec' },
				// A calendar deadline, not a per-visitor window: everyone shopping
				// this page is racing the same date, and `onExpire: restart` is
				// refused by the block for exactly that reason.
				endsAt: { $ref: 'season.cutoffIso' },
				bg: '#1a1024',
				fg: '#ffffff',
				digitColor: '#f3ad4f',
				chipBg: '#2e2038'
			}
		},
		{
			id: 'offer-strip',
			component: 'announcement_bar',
			version: 1,
			props: {
				message: '🎁 {discount}% off + free shipping 🚚',
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
			layout: { row: 'hero', col: 'left' },
			props: {
				/*
				 * ⚠️ ONE DRAWING, AND IT IS NOT THE PRODUCT.
				 *
				 * There is no photography of this costume. The pictures that exist
				 * are the reel's and the resellers' listings, and neither is ours to
				 * put on a page taking money. So the gallery carries an illustration
				 * we drew: it says what the thing is without borrowing anyone's
				 * photo and without pretending to show the item that ships.
				 *
				 * This is a launch blocker, not a nice-to-have. Nobody buys apparel
				 * for a dog from a cartoon. Shoot the product — on a dog, from the
				 * side, which is the angle the costume is built for — drop the files
				 * in `static/products/grim-reaper-dog-costume/`, and list them here.
				 */
				items: [
					{
						src: '/products/grim-reaper-dog-costume/placeholder.svg',
						alt: 'Illustration: a dog wearing the hooded rider costume under a full moon'
					}
				],
				variant: 'gallery',
				aspect: 'square',
				thumbnails: false,
				arrows: false,
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
				// Each line is answered again in the FAQ below — walking, fitting,
				// cats — so the page makes one argument instead of four.
				items: [
					{ icon: '💀', text: 'The reaper **rides on their back**, scythe and all' },
					{ icon: '🐾', text: 'A saddle, not a bodysuit — **all four legs stay free**' },
					{ icon: '⏱️', text: 'Two straps. **On in about ten seconds**' },
					{ icon: '🐈', text: 'Fits cats too' }
				]
			}
		},
		{
			id: 'cutoff-note',
			component: 'announcement_bar',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// The clock at the top is the urgency; this is the instruction. A date
			// someone can write down converts better than a ticking number, and it
			// is the sentence that stops a November refund queue.
			requires: ['season.cutoffLabel'],
			props: {
				// `{date}` reaches the block still in the template: the translator
				// leaves unknown tokens alone and `vars` fills it here.
				message: { $ref: 'copy.cutoffLine' },
				vars: { date: { $ref: 'season.cutoffLabel' } },
				size: 'sm',
				weight: 'semibold',
				bg: '#f3ad4f',
				fg: '#1a1024'
			}
		},
		{
			id: 'size',
			component: 'size_picker',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// A HOST block, not a library one — see SizePicker.svelte. Without it
			// this page would sell three sizes and let a visitor choose none of
			// them, which for a costume that has to fit over the shoulders is the
			// whole product.
			requires: ['sizes.options'],
			props: {
				heading: { $ref: 'copy.sizeLabel' },
				options: { $ref: 'sizes.options' },
				field: 'size',
				// The honest version of sizing guidance while there is no chart to
				// point at. It is what every reseller of this costume publishes,
				// and it is backed by the free exchange rather than by a table.
				note: { $ref: 'copy.sizeHint' },
				soldOutLabel: { $ref: 'copy.soldOut' },
				width: 'full'
			}
		},
		{
			id: 'bundle-picker',
			component: 'bundles',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['bundles.tiers'],
			props: {
				heading: 'Bundle & Save',
				tiers: { $ref: 'bundles.tiers' },
				addons: { $ref: 'bundles.addons' },
				// No `options`: one colourway, and a select with a single entry in it
				// reads as a control that is broken rather than one that is
				// unnecessary. Size is chosen above, by the block that owns it.
				cta: 'Buy now',
				accent: '#2f2438',
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
		// The chart appears the moment the supplier's measurements land in
		// `scripts/content.js` — both blocks declare `requires`, so until then
		// this section is not on the page at all rather than being a heading over
		// an empty table. See the note on COSTUME_SIZE_CHART for why we are not
		// filling it in ourselves.
		{
			id: 'size-chart-heading',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['sizes.rows'],
			props: { text: { $ref: 'sizes.title' }, level: 3, size: 'sm', width: 'full' }
		},
		{
			id: 'size-chart',
			component: 'bullet_list',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			requires: ['sizes.rows'],
			props: {
				// Text rows, not `/size-chart.svg` — that graphic is the life
				// jacket's, down to its numbers, and it is the exact mistake this
				// codebase already paid for once with a competitor's chart.
				items: { $ref: 'sizes.rows' },
				size: 'sm',
				width: 'full'
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
						label: 'Will it arrive before Halloween? 🎃',
						body: 'Order early enough and yes.\n\nWe work the cut-off back from our real processing and delivery times rather than rounding it up to look better, and we show it at the top of this page for as long as it is still reachable. Once it passes we stop promising October 31 — we would rather tell you now than refund you in November.'
					},
					{
						label: 'Can my dog actually walk in it?',
						body: 'Yes. The costume is a saddle that sits on the back and straps under the chest and belly — nothing covers the legs or the paws, so their gait is unchanged.\n\nMost dogs ignore it after the first minute.'
					},
					{
						label: 'How do I pick a size?',
						body: 'Measure your dog’s chest at its widest point, just behind the front legs, and pick the size that range falls in. The straps adjust either way from there.\n\nIf your dog is between sizes, size up — and if you are not sure, email us the measurement and we will tell you which one to order.'
					},
					{
						label: 'Will it stay on?',
						body: 'The straps are adjustable and should be snug enough that two fingers fit underneath and no more.\n\nIt is made for photos, a party or a walk around the block — not for being left on unsupervised.'
					},
					{
						label: 'Does it work on a cat?',
						body: 'It does. The saddle sits over the shoulders the same way.\n\nCats have less patience for it than dogs, so start with a short session.'
					},
					{
						label: 'What if it doesn’t fit? 📏',
						body: 'Reach out and we’ll exchange it, hassle-free — 30 days, no questions asked.\n\nIf the exchange can’t reach you before Halloween we’ll refund you instead; a costume that arrives in November is no use to anyone.'
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
				eyebrow: 'Backed for 30 days',
				body: 'One night of photos your friends will still be sending back to you next October. Shop with total confidence: you’re covered by our **Ironclad 30-Day Guarantee**. If you don’t absolutely love it, or if it arrives damaged, we’ll refund your money immediately. No questions asked. **100% risk-free.**',
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
				tiers: { $ref: 'bundles.tiers' },
				selectionField: 'bundle',
				image: { $ref: 'product.image' },
				alt: { $ref: 'product.alt' },
				title: { $ref: 'product.title' },
				price: { $ref: 'product.price' },
				compareAt: { $ref: 'product.compareAt' },
				cta: 'Buy now',
				accent: '#6b3fa0'
			}
		}
	]
};
