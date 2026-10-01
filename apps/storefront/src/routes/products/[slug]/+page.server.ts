import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { loadBundles } from '$lib/store/bundles';
import { loadOffer } from '$lib/store/offer';
import { loadProduct } from '$lib/store/product';
import { loadReviews } from '$lib/store/reviews';
import { loadFeaturedReviews, loadPhotoWall, loadSpotlightQuotes } from '$lib/store/reviews-wall';
import { loadSizeChart } from '$lib/store/sizes';
import { loadStock } from '$lib/store/stock';
import { PRODUCT_PAGES } from '$lib/store/pages';
import { variantChoices } from '$lib/store/variants';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;

	const page = PRODUCT_PAGES[slug];
	if (!page) error(404, `No page manifest for "${slug}" — add one in $lib/store/pages.ts`);

	// Every source is a live query. They run together because none depends on
	// another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, sizeChart, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug, page.pickSize),
		loadOffer(commerce, locale, settings, slug),
		loadSizeChart(commerce, locale, slug),
		commerce.catalog.getProduct(slug, locale)
	]);

	if (!product || !catalogue) error(404, `No product at "${slug}"`);

	// Sources compose — each one is a namespace a `$ref` path can start with.
	const resolve = createRefResolver({
		bundles,
		offer,
		product,
		// Summary and wall live in one namespace but two files: the average moves
		// when a customer writes something, the featured set moves when someone
		// curates it. Both are empty until the reviews are real, and the blocks
		// that need them declare `requires` and drop out.
		reviews: {
			...loadReviews(),
			featured: loadFeaturedReviews(),
			spotlight: loadSpotlightQuotes(),
			// The photos without the words, for as long as the words aren't real.
			photos: loadPhotoWall()
		},
		sizes: sizeChart,
		// Not a query: the scarcity bar is a marketing number from store
		// settings, and inventory is maintained outside this system.
		stock: loadStock(settings)
	});

	// Version the AUTHORED manifest, then bind. The other order compiles and
	// renders identically but mints a new version every time stock or a price
	// moves, so no two conversions share a version and the funnel's own
	// reporting goes quietly useless.
	const { definition, version } = bindDefinition(page.manifest, resolve);

	// The blocks choose a label; they know nothing of variant ids, and they
	// must not — a block that carried one would be coupled to this catalogue.
	// So the host ships the lookup and does the resolving in its own submit
	// handler. Whether the label names a size too is the page's call.
	const variantIndex = variantChoices(catalogue, page.pickSize);

	return {
		definition,
		version,
		variantIndex,
		pickSize: page.pickSize,
		slug,
		currency: catalogue.currency,
		// The manifest is content, not metadata: the title and description that
		// reach search and social come from the catalogue, in the visitor's
		// locale, the same as they did before this page was blocks.
		seo: {
			title: catalogue.title,
			description: catalogue.description ?? '',
			priceCents: catalogue.priceCents
		}
	};
};
