import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { createTranslator } from '$lib/i18n';
import { loadBundles } from '$lib/store/bundles';
import { loadOffer } from '$lib/store/offer';
import { loadProduct } from '$lib/store/product';
import { loadReviews } from '$lib/store/reviews';
import { loadFeaturedReviews, loadPhotoWall, loadSpotlightQuotes } from '$lib/store/reviews-wall';
import { loadSeason } from '$lib/store/season';
import { loadSizeChart, loadSizeOptions } from '$lib/store/sizes';
import { loadStock } from '$lib/store/stock';
import { PRODUCT_PAGES } from '$lib/store/pages';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;
	// Per-render, never a module-level singleton: the server handles many
	// locales at once and a shared translator leaks across requests.
	const t = createTranslator(locale);

	const page = PRODUCT_PAGES[slug];
	if (!page) error(404, `No page manifest for "${slug}" — add one in $lib/store/pages.ts`);

	// Every source is a live query. They run together because none depends on
	// another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, sizeChart, sizeOptions, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		loadOffer(commerce, locale, settings, slug),
		loadSizeChart(commerce, locale, slug),
		loadSizeOptions(commerce, locale, slug),
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
		sizes: { ...sizeChart, ...sizeOptions },
		// Not a query either: a calendar deadline, worked back from the shipping
		// promise. Empty outside the run-up to Halloween, which is what drops the
		// seasonal blocks off the page instead of leaving them counting down to a
		// date in the past.
		season: loadSeason(locale),
		// Copy that already exists in the language packs is bound, not typed into
		// the manifest — the same rule the checkout follows. The seasonal strip
		// carries a DATE, and a date formats itself in the visitor's language
		// whatever the sentence around it does: leaving that sentence a literal
		// produced "Order by 12 de octubre to have it before October 31", which
		// is worse than either language on its own. `{date}` survives the
		// translator untouched and the block fills it from `vars`.
		copy: {
			cutoffHeadline: t('season.cutoffHeadline'),
			cutoffLine: t('season.cutoffLine'),
			sizeLabel: t('product.sizeLabel'),
			sizeHint: t('product.sizeMeasureHint'),
			soldOut: t('product.soldOut')
		},
		// Not a query: the scarcity bar is a marketing number from store
		// settings, and inventory is maintained outside this system.
		stock: loadStock(settings)
	});

	// Version the AUTHORED manifest, then bind. The other order compiles and
	// renders identically but mints a new version every time stock or a price
	// moves, so no two conversions share a version and the funnel's own
	// reporting goes quietly useless.
	const { definition, version } = bindDefinition(page, resolve);

	// The blocks choose a colour and a size; they know nothing of variant ids,
	// and they must not — a block that carried one would be coupled to this
	// catalogue. So the host ships the lookup and does the resolving in its own
	// submit handler.
	//
	// EVERY buyable combination, not one row per colour. It used to be the
	// latter, with the size picked here as "the first one in stock" — which is
	// how a page carrying a size chart shipped whatever size the loop reached
	// first. The host still falls back to that when nothing on the page offers a
	// size choice, so a manifest without a `size_picker` behaves as before.
	const sizes = catalogue.options[1]?.values ?? [];
	const variantIndex = (catalogue.options[0]?.values ?? []).flatMap((colour) =>
		sizes.flatMap((size) => {
			const match = catalogue.variants.find(
				(v) => v.options[0] === colour.value && v.options[1] === size.value
			);
			if (!match || match.stock <= 0) return [];
			return [
				{
					colour: colour.label ?? colour.value,
					colourCode: colour.value,
					size: match.options[1] ?? '',
					sizeLabel: size.label ?? size.value,
					variantId: match.id,
					unitPriceCents: match.priceCents,
					sku: match.sku
				}
			];
		})
	);

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
