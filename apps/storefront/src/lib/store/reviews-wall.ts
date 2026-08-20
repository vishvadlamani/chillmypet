/**
 * Featured customer reviews — the wall, not the summary.
 *
 * Separate from `reviews.ts` (average + count) because the two get placed apart:
 * the summary sits by the buy decision, the cards sit further down where someone
 * is already reading.
 *
 * The photos are real customer UGC, resized from the product folder into
 * `static/reviews`. The WORDS BELOW ARE NOT REAL. Each one was written against
 * what its own photo shows — the kayak, the pool float, the paddleboard, the
 * zip — so nothing contradicts the picture beside it. That still makes each one
 * a claim attributed to a named person who never made it, which is a fake
 * testimonial under the FTC's rule on consumer reviews (16 CFR 465) and is
 * exactly what carries penalties, not merely what reads as filler.
 *
 * So they do not ship. `REVIEWS_ARE_REAL` is the switch: the loaders return
 * nothing while it is false, every block that needs review data declares
 * `requires` and drops out of the page, and the rest of the page is unaffected.
 * Replace the words below with real customer text, flip the flag, and the
 * rating, the hero quotes and the wall all come back.
 *
 * 22 of the 23 source images are here. The one left out shows a poodle asleep in
 * a car wearing a mint harness — a different product entirely, and a review
 * photo of something you don't sell undoes the credibility of the other 22.
 */

export interface FeaturedReview {
	name: string;
	verified: boolean;
	rating: number;
	body: string;
	src: string;
	alt: string;
}

/**
 * Two or three short quotes for the hero carousel. Kept separate from the wall
 * because the buy column is narrow — a four-line review that reads fine in a
 * masonry card pushes the CTA off the screen here.
 */
/**
 * Are the words below written by actual customers?
 *
 * One switch for all three review sources — the summary, the hero quotes and
 * the wall — because they make the same kind of claim and half of them being
 * real is not a state worth having.
 */
export const REVIEWS_ARE_REAL = false;

/** Same answer, for the summary loader next door. */
export const showPlaceholderReviews = (): boolean => REVIEWS_ARE_REAL;

export function loadSpotlightQuotes() {
	// `undefined`, not `[]`: `requires` drops a block when its path does not
	// resolve, and an empty array resolves — which would render an empty quote
	// carousel instead of no carousel.
	if (!showPlaceholderReviews()) return undefined;
	return [
		{
			quote: 'He panicked the first time we got in the boat. Second trip he fell asleep in it.',
			name: 'Katherine N.',
			avatar: '/avatar-floatly.webp',
			rating: 5
		},
		{
			quote: 'She is fourteen and arthritic. This is the first summer she has been back in the lake.',
			name: 'Grant H.',
			avatar: '/avatar-floatly.webp',
			rating: 5
		},
		{
			quote: 'The handle means I can lift a soaking Frenchie onto the dock one-handed.',
			name: 'Devon B.',
			avatar: '/avatar-floatly.webp',
			rating: 5
		}
	];
}

export function loadFeaturedReviews(): FeaturedReview[] | undefined {
	if (!showPlaceholderReviews()) return undefined;
	return PLACEHOLDER_REVIEWS;
}

/**
 * The photos on their own — no name, no stars, no words.
 *
 * This is what a proof section can honestly show before there are reviews to
 * quote: the product in the water, which every one of these pictures does show.
 * The moment `REVIEWS_ARE_REAL` is true the wall above replaces it with the
 * real thing, quotes and all.
 */
export function loadPhotoWall(): { src: string; alt: string }[] | undefined {
	if (showPlaceholderReviews()) return undefined;
	return PLACEHOLDER_REVIEWS.map(({ src, alt }) => ({ src, alt }));
}

const PLACEHOLDER_REVIEWS: FeaturedReview[] = [
		{
			name: 'Marisol V.',
			verified: true,
			rating: 5,
			body: 'Took Otis out on the boat for the first time with this on. He is a Frenchie — he sinks like a brick without it — and I finally spent the whole day watching the water instead of watching him.',
			src: '/reviews/boat-merle.jpg',
			alt: 'Merle French bulldog in a blue life jacket on a boat'
		},
		{
			name: 'Hannah K.',
			verified: true,
			rating: 5,
			body: 'Poolside all summer. She will not go near the steps without it now — puts her head through it herself.',
			src: '/reviews/pool-corgi.jpg',
			alt: 'Corgi in a yellow life jacket beside a swimming pool'
		},
		{
			name: 'Priya N.',
			verified: true,
			rating: 5,
			body: 'Every jacket I tried before this gaped at the neck and squeezed her ribs. Bulldogs are all chest. This is the first one that closed properly without riding up.',
			src: '/reviews/tile-bulldog.jpg',
			alt: 'English bulldog puppy wearing a coral life jacket'
		},
		{
			name: 'Marcus O.',
			verified: true,
			rating: 5,
			body: 'Three hours on the kayak and he stood at the bow the whole way like he owned it. The handle meant I could lift him in and out without tipping us.',
			src: '/reviews/kayak-fawn.jpg',
			alt: 'Fawn French bulldog in a life jacket on an orange kayak'
		},
		{
			name: 'Devon B.',
			verified: true,
			rating: 5,
			body: 'The handle is the whole thing for me. Lifting a soaking 12kg dog out of the lake by his harness was awful for both of us — now it is one hand and he is out.',
			src: '/reviews/sidewalk-black.jpg',
			alt: 'Black French bulldog in a hi-vis life jacket outdoors'
		},
		{
			name: 'Camila S.',
			verified: true,
			rating: 5,
			body: 'She floats on her raft in this like it is a day spa. Zero interest in swimming, total interest in sunbathing.',
			src: '/reviews/poolfloat-floral.jpg',
			alt: 'French bulldog in a floral life jacket on a pool float'
		},
		{
			name: 'Grant H.',
			verified: true,
			rating: 5,
			body: 'First proper swim in the river and he kept his chin well clear the whole time. He is fourteen and arthritic — I would not have risked it otherwise.',
			src: '/reviews/swimming-terrier.jpg',
			alt: 'Small grey terrier swimming in a river wearing a hi-vis life jacket'
		},
		{
			name: 'Kyle R.',
			verified: true,
			rating: 5,
			body: 'Paddleboarding with him is the best part of my week now. He fell in twice, popped straight back up, and climbed on again.',
			src: '/reviews/paddleboard-black.jpg',
			alt: 'Black French bulldog in a life jacket on a paddleboard'
		},
		{
			name: 'Tanya R.',
			verified: true,
			rating: 4,
			body: 'We put it on him around the house for a few days first, which the sizing guide suggested, and by the weekend he did not care about it at all. Took off half a star — I wish the strap ends tucked away better.',
			src: '/reviews/hallway-blue.jpg',
			alt: 'French bulldog wearing a hi-vis life jacket indoors'
		},
		{
			name: 'Aisha B.',
			verified: true,
			rating: 5,
			body: 'Got the tropical print and regret nothing. Everyone at the lake asked where it was from.',
			src: '/reviews/selfie-tropical.jpg',
			alt: 'Owner and French bulldog in a floral life jacket by the water'
		},
		{
			name: 'Elliot P.',
			verified: true,
			rating: 5,
			body: 'River current caught her once and she just bobbed. That was the moment I stopped worrying about the price.',
			src: '/reviews/river-boston.jpg',
			alt: 'Boston terrier in a pink life jacket standing in a shallow river'
		},
		{
			name: 'Owen F.',
			verified: true,
			rating: 5,
			body: 'Bought it expecting flimsy. The zip is chunky, the stitching is doubled at every stress point, and the buckles have not shifted once in a season.',
			src: '/reviews/detail-zip.jpg',
			alt: 'Close-up of the life jacket zip and reinforced stitching'
		},
		{
			name: 'Trina W.',
			verified: true,
			rating: 5,
			body: 'He naps on the boat bench in it. Comfortable enough that he forgets he is wearing it, which was my main worry.',
			src: '/reviews/boat-hivis.jpg',
			alt: 'French bulldog resting on a boat seat in a hi-vis life jacket'
		},
		{
			name: 'Rosa M.',
			verified: true,
			rating: 5,
			body: 'Ordered for a rescue with no swimming history. Two weekends in and she paddles out to the dock on her own.',
			src: '/reviews/indoor-terrier.jpg',
			alt: 'Small white dog wearing a blue and grey life jacket indoors'
		},
		{
			name: 'Jonah T.',
			verified: true,
			rating: 5,
			body: 'Bright enough that I can see him from the far end of the lake. That alone was worth it.',
			src: '/reviews/paddleboard-hivis.jpg',
			alt: 'French bulldog in a hi-vis green life jacket on a paddleboard'
		},
		{
			name: 'Bea N.',
			verified: true,
			rating: 5,
			body: 'He rolled over and fell asleep in it on the kitchen floor within a day. I take that as approval.',
			src: '/reviews/floor-rollover.jpg',
			alt: 'French bulldog lying on its back wearing a blue life jacket'
		},
		{
			name: 'Yvette L.',
			verified: true,
			rating: 5,
			body: 'The extra small actually fits a 4kg chihuahua. I have returned three jackets that claimed to and did not.',
			src: '/reviews/indoor-chihuahua.jpg',
			alt: 'Chihuahua wearing a floral life jacket indoors'
		},
		{
			name: 'Selina G.',
			verified: true,
			rating: 5,
			body: 'She chases the ball across the pool in it now. Before this she would only wade to her knees.',
			src: '/reviews/pool-swim.jpg',
			alt: 'Dog swimming across a pool in a floral life jacket'
		},
		{
			name: 'Noah A.',
			verified: true,
			rating: 4,
			body: 'Good fit and dries fast on the deck rail. One star off only because I would like a second colour in his size.',
			src: '/reviews/deck-fawn.jpg',
			alt: 'Fawn French bulldog in a blue life jacket on a sunny deck'
		},
		{
			name: 'Iris D.',
			verified: true,
			rating: 5,
			body: 'Purple was the right call, and the reflective strips are genuinely reflective — headlights pick him up from down the street.',
			src: '/reviews/indoor-purple.jpg',
			alt: 'Cream French bulldog wearing a purple life jacket'
		},
		{
			name: 'Nadia E.',
			verified: true,
			rating: 5,
			body: 'She sits in the kayak footwell for hours in this. Rinses clean and is dry by the time we have packed up.',
			src: '/reviews/kayak-shihtzu.jpg',
			alt: 'Shih tzu in a floral life jacket sitting on a kayak'
		},
		{
			name: 'Callum W.',
			verified: true,
			rating: 5,
			body: 'Bright enough that I can pick him out at dusk from the far end of the dock. He wears it in the house now for no reason whatsoever.',
			src: '/reviews/doorway-yellow.jpg',
			alt: 'French bulldog in a yellow life jacket at home'
		}
];
