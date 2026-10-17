import type { FunnelDefinition } from '@funnel/core';

/**
 * The Dog Christmas Tree Costume page.
 *
 * Laid out and styled like littletreepups.com, on the owner's instruction
 * (2026-10-16): cream and pine, Poppins, pill pickers, bundle cards, an
 * editorial story, a sage size-guide band, a two-column FAQ and a sage
 * closing band. The look lives in the `tree` theme (`pages.ts`,
 * `$lib/styles/tree-theme.css`) and the blocks' `look` props. Only the look
 * came across: every word here is ours and written for this product.
 *
 * What is deliberately absent, and should stay absent:
 *   - countdown chips, stock bars, "X viewing": none of them would be true.
 *     The one dated line is the real Christmas delivery cut-off, and it drops
 *     out by itself once the date has passed.
 *   - a struck-through price: the costume has never been offered at any
 *     other price, and the bundle cards state their saving in words, from
 *     the store's own quantity breaks (`bundles.plain` carries no "was").
 *   - ratings and reviews: there are none yet, and `REVIEWS_ARE_REAL` is
 *     false. The shop's promises stand where the reviews would.
 *   - pre-ticked paid extras of any kind.
 *
 * Literals are authored decisions; `$ref` is anything the store knows (the
 * price, the colours and sizes in stock, the bundle prices, the cut-off, the
 * weight guide).
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
				// Red is the catalogue's own photo (worn-red.jpg, the listing image
				// everywhere else too). Green's catalogue photo is a flat-lay, so the
				// page shows the green costume worn instead.
				photos: {
					green: {
						src: '/products/dog-christmas-costume/green-studio.jpg',
						alt: 'A small curly-haired dog wearing the green Christmas tree costume, hood up, gold star on top'
					}
				},
				// The shots not tied to a colour, after the colours' own photos, so
				// every angle is one swipe away on the first screen.
				extras: [
					{ src: '/products/dog-christmas-costume/details.jpg', alt: 'The green costume worn, with close-ups of the gold star topper, the pom-poms and the layered cape' },
					{ src: '/products/dog-christmas-costume/duo.jpg', alt: 'Two small dogs by a Christmas tree, one in the green costume and one in the red' },
					{ src: '/products/dog-christmas-costume/cat.jpg', alt: 'A tabby cat wearing the green Christmas tree costume on a rug' }
				],
				hint: 'Swipe to explore',
				title: 'Dog Christmas Tree Costume photos'
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
			// Nothing to pick, nothing to sell.
			requires: ['variants.available'],
			props: {
				look: 'pills',
				designs: { $ref: 'variants.designs' },
				sizes: { $ref: 'variants.sizes' },
				available: { $ref: 'variants.available' },
				price: { $ref: 'variants.price' },
				priceNote: 'Free shipping',
				tagline: 'The little Christmas tree that follows you from room to room.',
				designLabel: 'Colour',
				sizeLabel: 'Size',
				// The same bands as the size guide's table, in pounds for a US buyer;
				// the table carries kilograms too.
				sizeNote: 'Sized by weight: S 3–6 lb · M 6–11 lb · L 11–17 lb. Between two? Go up.',
				sizeGuideHref: '#size-guide',
				sizeGuideLabel: 'Size guide',
				sizeMissing: 'Pick your dog’s size first, then we’re good to go.',
				// The store's real quantity breaks, priced by the server; the cards
				// only add words. Every costume in a bundle is the colour and size
				// picked above, and the copy says so.
				tiers: { $ref: 'bundles.plain' },
				tierField: 'costume_bundle',
				tiersTitle: '🎄 Choose your bundle',
				unitsNoun: 'costumes',
				tierCopy: [
					{ units: 1, title: 'One costume • 1', tag: 'Free US shipping', sub: 'One festive costume', ribbon: 'Just one' },
					{ units: 2, title: 'Two costumes • 2', tag: 'Free US shipping', sub: 'Two, in the colour and size you pick', ribbon: 'Pair up' },
					{ units: 3, title: 'Three costumes • 3', tag: 'Free US shipping + best value', sub: 'Three, for the whole pack', ribbon: 'Best value' }
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
			// The same list as the hoodie and the life jacket: only what the
			// checkout offers. Change all three together. Google Pay stays off
			// until it is on in Stripe, never before. No Discover: Stripe does not
			// offer it to accounts in Czechia, which is where ChillMP is registered.
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
						body: 'Sizes go by your pet’s weight: S for 3–6 lb, M for 6–11 lb, L for 11–17 lb.\n\nIt’s a cape with a hood, so nothing goes around the legs or the belly and it forgives a stocky build. Between two sizes, go up: the cord at the neck takes up the slack.',
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
						body: 'One hooded cape in the colour and size you pick, with the glitter star on the hood and the pom-poms stitched on.\n\nHand wash in cool water and lay flat to dry. Keep the star away from heat and the washing machine.'
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
			// What the costume is for, after the buy box rather than in it.
			props: {
				eyebrow: 'Christmas, with the dog in it',
				title: 'The one who steals the Christmas card.',
				body: [
					'Every year there’s one photo everybody keeps. This is how your dog ends up in the middle of it.',
					'A soft hooded cape that turns a small dog, or a patient cat, into a little Christmas tree: three ruffled tiers, bright pom-pom baubles and a glitter gold star on top.'
				],
				points: [
					{ title: 'A tree from every side', body: 'Ruffled tiers down the back, baubles all round, the star on the hood. It reads as a tree from the front, the back and the sofa.' },
					{ title: 'Red or green', body: 'Classic pine green or a bold Christmas red. Same cut, same star, same pom-poms.' },
					{ title: 'Off as fast as it goes on', body: 'One cord and one button. Dress them for the photo, the party or the visit, then let them be a dog again.' }
				],
				image: {
					src: '/products/dog-christmas-costume/cat.jpg',
					alt: 'A tabby cat wearing the green Christmas tree costume on a rug'
				}
			}
		},
		{
			id: 'both-colours',
			component: 'photo_pair',
			version: 1,
			// The costume itself, in both colours: the photos are the ones we ship
			// from, so the captions describe the costume, not a customer.
			props: {
				eyebrow: 'Every breed, one little tree.',
				title: 'Small dogs, big Christmas.',
				sub: 'Fluffy, scruffy or sleek: it sits the same on every small dog. Choose by your dog’s weight, not their breed.',
				photos: [
					{ src: '/products/dog-christmas-costume/shih-tzu.jpg', alt: 'A shih tzu in the green Christmas tree costume in front of a decorated tree', caption: 'Ready by the tree' },
					{ src: '/products/dog-christmas-costume/schnauzer.jpg', alt: 'A miniature schnauzer in the green Christmas tree costume', caption: 'Ready for the photo' }
				],
				note: 'AI-styled images. For small dogs and cats up to 17 lb (7.5 kg); see the size guide below.'
			}
		},
		{
			id: 'how-it-goes-on',
			component: 'step_list',
			version: 1,
			// The question a costume page has to answer before the price: will I
			// get it on my dog. Three steps beside the hood close-up.
			props: {
				title: 'On in ten seconds.',
				lead: 'No legs to thread, no zips. Hood, cord, button — done.',
				image: {
					src: '/products/dog-christmas-costume/living-room.jpg',
					alt: 'A small dog in the green Christmas tree costume sitting on a rug by the Christmas tree'
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
			// them together.
			props: {
				items: [
					{
						icon: 'mail',
						title: 'A real person answers',
						body: 'Email contact@chillmypet.com about a size, an order or a return. We reply within 1–2 business days.'
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
				eyebrow: 'Weigh first, then pick',
				title: 'Find their fit.',
				lead: 'For small dogs and cats. Sizes go by weight, from the maker’s own table.',
				tips: [
					'It’s a cape with a hood: nothing goes around the legs or the belly, so it is forgiving on shape.',
					'Between two sizes? Go up. A loose cape looks better than a tight one, and the cord at the neck takes up the slack.'
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
						label: 'Will my dog keep it on?',
						body: 'It is a light cape, not a full suit, so there is nothing around the legs or belly. Most dogs forget it after a minute.\n\nIf your dog does not like the hood, it can sit back on the neck like a collar, and the tree still reads from behind.'
					},
					{
						label: 'Can a cat wear it?',
						body: 'Yes. Size S fits most cats and tiny dogs. Check the weight guide, and pick the bigger size if your pet is between two.'
					},
					{
						label: 'How do I pick the size?',
						body: 'Go by weight: S for 3–6 lb (1.5–2.5 kg), M for 6–11 lb (2.5–5 kg), L for 11–17 lb (5–7.5 kg). The cord at the neck adjusts the fit.\n\nNot sure? Size up. A loose cape looks better than a tight one.'
					},
					{
						label: 'How do the bundles work?',
						body: 'Two or three costumes cost less each: the saving is on each card, and it comes off at checkout. Every costume in a bundle is the colour and size you picked; for a mix, add each one to your cart and the saving still counts them all.'
					},
					{
						label: 'Will it arrive before Christmas?',
						body: 'We take 2–4 business days to pack, then 5–12 days on the road. Order by the date in the bar at the top and it should reach a US address in time.'
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
			id: 'closing',
			component: 'closing_cta',
			version: 1,
			props: {
				eyebrow: 'This Christmas, dress the dog too.',
				title: 'Every tree needs a little one beside it.',
				cta: 'Choose their costume',
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
				// Follows the bundle card chosen in the picker, so the bar shows
				// and buys the same count.
				tiers: { $ref: 'bundles.plain' },
				selectionField: 'costume_bundle',
				cta: 'Add to cart',
				accent: '#285B43',
				accentText: '#FFFFFF'
			}
		}
	]
};
