/**
 * Bundle tiers and the add-ons attached to them.
 *
 * Every price here is a number someone is charged, so it lives in the data
 * layer and reaches the manifest through `$ref`. The compare-at figures are the
 * ones with legal weight — a struck price has to be a price the product was
 * genuinely sold at, and hardcoding it in a manifest is how it quietly stops
 * being true.
 */

export interface BundleTier {
	id: string;
	title: string;
	subtitle?: string;
	price: string;
	compareAt?: string;
	badge?: string;
	image?: string;
	alt?: string;
	/** How many variant pickers the tier shows when chosen. */
	units?: number;
	selected?: boolean;
}

export interface BundleAddon {
	id: string;
	label: string;
	price?: string;
	compareAt?: string;
	control?: 'toggle' | 'checkbox';
	on?: boolean;
	fixed?: boolean;
}

export function loadBundles(): { tiers: BundleTier[]; addons: BundleAddon[]; colours: string[] } {
	return {
		tiers: [
			{
				id: 'standard',
				title: 'Floatly™ Standard',
				subtitle: 'You save 52%',
				price: '$85',
				compareAt: '$178',
				// PLACEHOLDER image — no product photography in this repo.
				image: '/product-floatly.webp',
				alt: 'Floatly Standard',
				units: 1,
				selected: true
			},
			{
				id: 'pro',
				title: 'Floatly™ Pro',
				subtitle: 'Free shipping · You save 51%',
				price: '$93',
				compareAt: '$188',
				badge: 'Most popular',
				image: '/reviews/boat-merle.jpg',
				alt: 'Floatly Pro',
				units: 1
			},
			{
				id: 'duo',
				title: 'Floatly™ Duo',
				subtitle: 'Keep one, gift one · You save 63%',
				price: '$149',
				compareAt: '$376',
				badge: 'Best value',
				image: '/reviews/kayak-fawn.jpg',
				alt: 'Floatly Duo',
				units: 2
			}
		],
		addons: [
			{
				id: 'ebook',
				label: 'Dog Water-Safety Guide',
				price: '$0.00',
				compareAt: '$7.00',
				control: 'toggle',
				on: true
			},
			{
				id: 'insured-shipping',
				label: 'Free and insured shipping',
				price: '$0.00',
				compareAt: '$9.00',
				control: 'toggle',
				on: true
			}
		],
		// Matches what the customer photos actually show.
		colours: ['Hi-Vis Yellow', 'Ocean Blue', 'Coral', 'Tropical']
	};
}
