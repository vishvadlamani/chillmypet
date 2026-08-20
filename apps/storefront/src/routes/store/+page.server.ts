import { bindDefinition, createRefResolver } from '@funnel/core';
import { STORE_PAGE } from './manifest';
import { loadBundles } from './bundles';
import { loadOffer } from './offer';
import { loadProduct } from './product';
import { loadReviews } from './reviews';
import { loadFeaturedReviews, loadSpotlightQuotes } from './reviews-wall';
import { loadStock } from './stock';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Sources compose — each one is a namespace a `$ref` path can start with.
	const resolve = createRefResolver({
		bundles: loadBundles(),
		offer: loadOffer(),
		product: loadProduct(),
		// Summary and wall live in one namespace but two files: the average moves
		// when a customer writes something, the featured set moves when someone
		// curates it.
		reviews: { ...loadReviews(), featured: loadFeaturedReviews(), spotlight: loadSpotlightQuotes() },
		stock: loadStock()
	});
	const { definition, version } = bindDefinition(STORE_PAGE, resolve);

	return { definition, version };
};
