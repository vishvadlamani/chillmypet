import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { STORE_PAGE } from './manifest';
import { loadBundles } from './bundles';
import { loadOffer } from './offer';
import { loadProduct, PRODUCT_SLUG } from './product';
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

	// The blocks choose a colour; they know nothing of variant ids, and they
	// must not — a block that carried one would be coupled to this catalogue.
	// So the host ships the lookup and does the resolving in its own submit
	// handler. Size is the host's call too: the first one actually buyable in
	// that colour, the same rule the product page's buy box uses.
	const catalogue = await commerce.catalog.getProduct(PRODUCT_SLUG, locale);
	const sizes = catalogue?.options[1]?.values ?? [];
	const variantIndex = (catalogue?.options[0]?.values ?? []).flatMap((colour) => {
		const match = sizes
			.map((size) =>
				catalogue!.variants.find(
					(v) => v.options[0] === colour.value && v.options[1] === size.value
				)
			)
			.find((v) => v && v.stock > 0);
		if (!match) return [];
		return [
			{
				colour: colour.label ?? colour.value,
				colourCode: colour.value,
				size: match.options[1] ?? '',
				variantId: match.id,
				unitPriceCents: match.priceCents,
				sku: match.sku
			}
		];
	});

	return { definition, version, variantIndex, slug: PRODUCT_SLUG, currency: catalogue!.currency };
};
