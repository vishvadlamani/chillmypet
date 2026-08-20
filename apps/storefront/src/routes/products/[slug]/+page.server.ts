import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { loadBundles } from '$lib/store/bundles';
import { loadOffer } from '$lib/store/offer';
import { loadProduct } from '$lib/store/product';
import { loadReviews } from '$lib/store/reviews';
import { loadFeaturedReviews, loadSpotlightQuotes } from '$lib/store/reviews-wall';
import { loadSizeChart } from '$lib/store/sizes';
import { loadStock } from '$lib/store/stock';
import { PRODUCT_PAGES } from '$lib/store/pages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;

	const page = PRODUCT_PAGES[slug];
	if (!page) error(404, `No page manifest for "${slug}" — add one in $lib/store/pages.ts`);

	// Every source is a live query. They run together because none depends on
	// another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, stock, sizeChart, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		loadOffer(commerce, locale, settings, slug),
		loadStock(commerce, locale, slug),
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
			spotlight: loadSpotlightQuotes()
		},
		sizes: sizeChart,
		stock
	});

	// Version the AUTHORED manifest, then bind. The other order compiles and
	// renders identically but mints a new version every time stock or a price
	// moves, so no two conversions share a version and the funnel's own
	// reporting goes quietly useless.
	const { definition, version } = bindDefinition(page, resolve);

	// The blocks choose a colour; they know nothing of variant ids, and they
	// must not — a block that carried one would be coupled to this catalogue.
	// So the host ships the lookup and does the resolving in its own submit
	// handler. Size is the host's call too: the first one actually buyable in
	// that colour.
	const sizes = catalogue.options[1]?.values ?? [];
	const variantIndex = (catalogue.options[0]?.values ?? []).flatMap((colour) => {
		const match = sizes
			.map((size) =>
				catalogue.variants.find(
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

	return {
		definition,
		version,
		variantIndex,
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
