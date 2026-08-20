/**
 * The product itself — what the sticky dock restates and what `buy_box` will
 * read when it exists.
 *
 * Price lives here, not in the manifest. The dock and the buy box both show it,
 * and two literals in two blocks is how a page ends up quoting two prices.
 */

export interface Product {
	title: string;
	/** The chosen variant, as a visitor would read it back. */
	variant: string;
	price: string;
	compareAt: string;
	image: string;
	alt: string;
}

export function loadProduct(): Product {
	return {
		title: 'Floatly™ Life Jacket',
		variant: 'Pro / Hi-Vis Yellow',
		// Real numbers from the live storefront's "MOST POPULAR" tier.
		price: '$93',
		compareAt: '$188',
		image: '/product-floatly.webp',
		alt: 'Floatly Pro'
	};
}
