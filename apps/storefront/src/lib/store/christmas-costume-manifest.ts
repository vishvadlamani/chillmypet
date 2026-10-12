import type { FunnelDefinition } from '@funnel/core';

/**
 * The Dog Christmas Tree Costume page.
 *
 * Built on the Christmas hoodie's blocks and rules, not the life jacket's:
 * gallery, colour, size, size guide, a closer look, benefits, FAQ, guarantee.
 * All copy is ours and written for this product.
 *
 * What is deliberately absent, and should stay absent:
 *   - countdown chips, stock bars, "X viewing": none of them would be true.
 *     The one dated line is the real Christmas delivery cut-off, and it drops
 *     out by itself once the date has passed.
 *   - a compare-at price: the costume has never been offered at any other price
 *   - ratings and reviews: there are none yet, and `REVIEWS_ARE_REAL` is false
 *
 * Literals are authored decisions; `$ref` is anything the store knows (the
 * price, the colours and sizes in stock, the cut-off, the weight guide).
 */
export const CHRISTMAS_COSTUME_PAGE: FunnelDefinition = {
	id: 'dog-christmas-costume',
	name: 'Dog Christmas Tree Costume — product page',
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
			id: 'campaign-hero',
			component: 'campaign_hero',
			version: 1,
			props: {
				eyebrow: 'Dog Christmas Tree Costume · Red or Green · S–L',
				headline: 'The cutest **tree in the house**',
				sub: 'A soft hooded cape with pom-pom baubles and a glitter star. On in ten seconds, off just as fast — made for the family photo.',
				cta: 'Pick a colour & size',
				// An in-page anchor to the picker, not a route.
				ctaHref: '#variant-picker',
				image: {
					src: '/products/dog-christmas-costume/hero-red.webp',
					alt: 'A small white dog wearing the red Christmas tree costume, hood up, gold star on top'
				},
				notes: ['Free standard shipping', '30-day free returns', 'Fits cats and small dogs'],
				sticker: 'Red or green 🎄'
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
				title: 'Dog Christmas Tree Costume photos'
			}
		},
		{
			id: 'hero-title',
			component: 'heading',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// Level 2: the campaign hero above carries the page's one h1.
			props: { text: { $ref: 'product.title' }, level: 2, size: 'lg', weight: 'bold' }
		},
		{
			id: 'hero-points',
			component: 'bullet_list',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			props: {
				size: 'sm',
				// Each line is answered below: the hood in the FAQ, the fit in the
				// size guide, the photo in the closer look.
				items: [
					{ icon: '🎄', text: 'Turns your dog into a **tiny Christmas tree** in ten seconds' },
					{ icon: '🌟', text: 'Soft fleece, ruffled tiers and a **glitter gold star**' },
					{ icon: '🎀', text: 'Ties at the neck, one button — **nothing around the legs**' },
					{ icon: '📸', text: 'Made for **the family photo**, the party and the gift pile' }
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
				designLabel: 'Colour',
				sizeLabel: 'Your dog’s size',
				sizeNote:
					'Go by weight: S for 1.5–2.5 kg (3–6 lb), M for 2.5–5 kg (6–11 lb), L for 5–7.5 kg (11–17 lb). Between two sizes? Pick the bigger one.',
				sizeGuideHref: '#size-guide',
				sizeGuideLabel: 'Size guide',
				sizeMissing: 'Pick your dog’s size first, then we’re good to go. 🎄',
				cta: 'Add to cart'
			}
		},
		{
			id: 'pay-badges',
			component: 'payment_badges',
			version: 1,
			layout: { row: 'hero', col: 'right' },
			// The same list as the hoodie and the life jacket: only what the
			// checkout offers. Change all three together. Google Pay stays off
			// until it is on in Stripe, never before.
			props: { methods: ['visa', 'mastercard', 'amex', 'discover', 'applepay'], width: 'full' }
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
						label: 'Will it arrive before Christmas? 🎄',
						body: 'Order by the date at the top of the page and it will.\n\nWe take 2–4 business days to pack your order, then it’s 5–12 days on the road. After the cut-off we still ship right away, but we can’t promise it lands before the 25th.',
						link: { label: 'Read our shipping policy', href: '/policies/shipping' }
					},
					{
						label: 'What if the size is wrong? 📏',
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
					'Sizes are **for your dog**, by weight. Weigh them, or check the vet’s last note.',
					'It’s a cape with a hood: nothing goes around the legs or the belly, so it is **forgiving on shape**.',
					'Between two sizes? **Go up.** A loose cape looks better than a tight one, and the cord at the neck takes up the slack.'
				],
				// The supplier's weight table, from the catalogue. Neck and back
				// length join it the moment the supplier's measured figures do.
				columns: { $ref: 'sizes.columns' },
				rows: { $ref: 'sizes.rows' },
				contact:
					'Not sure? Email contact@chillmypet.com with your dog’s weight and breed, and we’ll help you pick.'
			}
		},
		{
			id: 'rule-after-size',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'how-it-goes-on',
			component: 'step_list',
			version: 1,
			// The question a costume page has to answer before the price: will I
			// get it on my dog. Three steps beside the hood close-up.
			props: {
				title: 'On in ten seconds',
				lead: 'No legs to thread, no zips. **Hood, cord, button — done.**',
				image: {
					src: '/products/dog-christmas-costume/hood-detail.jpg',
					alt: 'Close-up of the hood opening, the tie cord and the button'
				},
				steps: [
					{ title: 'Pop the hood on', body: 'Or leave it back on the neck like a collar. The tree still reads from behind.' },
					{ title: 'Tie the cord', body: 'A soft bow at the neck sets the fit. Snug, never tight.' },
					{ title: 'Close the button', body: 'One button at the chest and the cape sits flat over the back.' }
				],
				note: 'Nothing goes around the legs or the belly, which is why most dogs forget they have it on.'
			}
		},
		{
			id: 'rule-after-steps',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'angles-heading',
			component: 'heading',
			version: 1,
			props: { text: 'Both colours, every angle', level: 2, size: 'lg', width: 'shell' }
		},
		{
			id: 'angles',
			component: 'media',
			version: 1,
			// The two shots not tied to a colour, on the same backdrop as the
			// gallery so the page reads as one shoot: the red front, the green back.
			props: {
				variant: 'grid',
				columns: 2,
				aspect: 'square',
				width: 'shell',
				items: [
					{ src: '/products/dog-christmas-costume/red.jpg', alt: 'The red Christmas tree costume, front, with the hood, star and pom-poms' },
					{ src: '/products/dog-christmas-costume/green-back.jpg', alt: 'The green costume from behind: three ruffled tiers shaped like a tree, star on top' }
				]
			}
		},
		{
			id: 'rule-after-look',
			component: 'divider',
			version: 1,
			props: { width: 'shell', spacing: 'loose' }
		},
		{
			id: 'benefits',
			component: 'benefit_cards',
			version: 1,
			props: {
				title: 'Why dogs (and their people) love it',
				items: [
					{
						icon: '⏱️',
						title: 'A tree in ten seconds',
						body: 'Tie the cord, close the button, done. No legs to thread, no zips.'
					},
					{
						icon: '🧸',
						title: 'Soft enough to forget',
						body: 'Light fleece with ruffled tiers. Most dogs settle into it within a minute.'
					},
					{
						icon: '📸',
						title: 'Built for the photo',
						body: 'Glitter gold star, bright pom-poms, and a hood that frames the face.'
					},
					{
						icon: '🎀',
						title: 'Easy on, easy off',
						body: 'The hood sits back on the neck if your dog prefers nothing on its head.'
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
						label: 'Will my dog keep it on?',
						body: 'It is a light cape, not a full suit, so there is nothing around the legs or belly. Most dogs forget it after a minute.\n\nIf your dog does not like the hood, it can sit back on the neck like a collar, and the tree still reads from behind.'
					},
					{
						label: 'Can a cat wear it?',
						body: 'Yes. Size S fits most cats and tiny dogs. Check the weight guide, and pick the bigger size if your pet is between two.'
					},
					{
						label: 'How do I pick the size?',
						body: 'Go by weight: S for 1.5–2.5 kg, M for 2.5–5 kg, L for 5–7.5 kg. The cord at the neck adjusts the fit.\n\nNot sure? Size up. A loose cape looks better than a tight one.'
					},
					{
						label: 'Will it arrive before Christmas?',
						body: 'We take 2–4 business days to pack, then 5–12 days on the road. Order by the date in the banner at the top and it should reach a US address in time.'
					},
					{
						label: 'How do I wash it?',
						body: 'Hand wash in cool water, squeeze gently and lay flat to dry. Keep the glitter star away from heat and the washing machine.'
					},
					{
						label: 'Is it safe to leave on?',
						body: 'Please stay with your pet while it is wearing any costume. The pom-poms are stitched on, but take the cape off before naps, play with other animals, or any time you are not watching.'
					},
					{
						label: 'Can I return or exchange it?',
						body: 'Yes. You have 30 days to return or swap an unworn costume, and the return label is on us.'
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
