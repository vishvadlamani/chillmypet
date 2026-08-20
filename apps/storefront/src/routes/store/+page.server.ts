import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { STORE_PAGE } from './manifest';
import { loadBundles } from './bundles';
import { loadOffer } from './offer';
import { loadProduct } from './product';
import { loadReviews } from './reviews';
import { loadFeaturedReviews, loadSpotlightQuotes } from './reviews-wall';
import { loadStock } from './stock';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { commerce, locale, settings } = locals;

	// Every source is a live query now. They run together because none depends
	// on another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, stock] = await Promise.all([
		loadProduct(commerce, locale),
		loadBundles(commerce, locale),
		loadOffer(commerce, locale, settings),
		loadStock(commerce, locale)
	]);

	if (!product) error(404, 'No product to sell on this page');

	// Sources compose — each one is a namespace a `$ref` path can start with.
	const resolve = createRefResolver({
		bundles,
		offer,
		product,
		// Summary and wall live in one namespace but two files: the average moves
		// when a customer writes something, the featured set moves when someone
		// curates it.
		reviews: {
			...loadReviews(),
			featured: loadFeaturedReviews(),
			spotlight: loadSpotlightQuotes()
		},
		stock
	});

	// Version the AUTHORED manifest, then bind. The other order compiles and
	// renders identically but mints a new version every time stock or a price
	// moves, so no two conversions share a version and the funnel's own
	// reporting goes quietly useless.
	const { definition, version } = bindDefinition(STORE_PAGE, resolve);

	return { definition, version };
};
