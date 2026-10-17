import { error, redirect } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { loadBundles } from '$lib/store/bundles';
import { loadChristmasDelivery } from '$lib/store/christmas';
import { sizeGuideTable } from '$lib/store/garment-sizes';
import { loadOffer } from '$lib/store/offer';
import { loadProduct } from '$lib/store/product';
import { loadReviews } from '$lib/store/reviews';
import { loadFeaturedReviews, loadPhotoWall, loadSpotlightQuotes } from '$lib/store/reviews-wall';
import { loadSizeChart } from '$lib/store/sizes';
import { loadStock } from '$lib/store/stock';
import { PRODUCT_PAGES } from '$lib/store/pages';
import { loadVariantPicker, variantEntries } from '$lib/store/variants';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;

	const page = PRODUCT_PAGES[slug];
	if (!page) error(404, `No page manifest for "${slug}" — add one in $lib/store/pages.ts`);

	// A product whose URL lands on its checkout (`landing` in pages.ts): the
	// ad's click goes straight to the one-screen form. The whole query string
	// travels, because `fbclid` is how Meta ties the click to the sale and
	// the Parameter Builder reads it there. `?details=1` is the long page.
	if (page.landing === 'checkout' && !url.searchParams.has('details')) {
		redirect(302, `/products/${slug}/checkout${url.search}`);
	}

	// Every source is a live query. They run together because none depends on
	// another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, sizeChart, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		loadOffer(commerce, locale, settings, slug),
		loadSizeChart(commerce, locale, slug),
		commerce.catalog.getProduct(slug, locale)
	]);

	if (!product || !catalogue) error(404, `No product at "${slug}"`);

	// A page with its own listing photo (`cardImage`) shows it wherever the
	// catalogue's lead photo would go: the sticky bar, the bundle cards, the
	// link preview.
	if (page.cardImage) {
		product.image = page.cardImage;
		bundles.tiers = bundles.tiers.map((tier) => ({ ...tier, image: page.cardImage }));
	}

	// Sources compose — each one is a namespace a `$ref` path can start with.
	const resolve = createRefResolver({
		bundles: {
			...bundles,
			// The same tiers without the undiscounted total, for a page that
			// shows its saving as words rather than a struck-through price.
			plain: bundles.tiers.map(({ compareAt: _, ...tier }) => tier)
		},
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
		// A sized product's guide is a table whose columns follow the product
		// (chest and length for a person, weight bands for a pet), a different
		// shape from the life jacket's chest-and-weight bullet rows. Empty when
		// the supplier's figures are not in yet, which shows the guide's note.
		sizes: page.pickSize ? (sizeGuideTable(catalogue) ?? {}) : sizeChart,
		// The design and size pickers. Only a manifest that names them reads them.
		variants: page.pickSize ? loadVariantPicker(catalogue, locale, page.leadDesign) : {},
		// Config, not computation: see `$lib/store/christmas.ts`. Empty once the
		// cut-off has passed, which drops the strip through `requires`.
		christmas: page.theme ? loadChristmasDelivery(settings) : {},
		// Not a query: the scarcity bar is a marketing number from store
		// settings, and inventory is maintained outside this system.
		stock: loadStock(settings)
	});

	// Version the AUTHORED manifest, then bind. The other order compiles and
	// renders identically but mints a new version every time stock or a price
	// moves, so no two conversions share a version and the funnel's own
	// reporting goes quietly useless.
	const { definition, version } = bindDefinition(page.manifest, resolve);

	// The blocks choose a colour; they know nothing of variant ids, and they
	// must not — a block that carried one would be coupled to this catalogue.
	// So the host ships the lookup and does the resolving in its own submit
	// handler. Size is the host's call too: the first one actually buyable in
	// that colour.
	//
	// Where the buyer picks the size, the lookup is every buyable pair instead,
	// and the host matches both codes.
	const sizes = catalogue.options[1]?.values ?? [];
	const firstSizePerColour = (catalogue.options[0]?.values ?? []).flatMap((colour) => {
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
	const variantIndex = page.pickSize ? variantEntries(catalogue) : firstSizePerColour;

	return {
		definition,
		version,
		variantIndex,
		pickSize: page.pickSize,
		theme: page.theme ?? null,
		// A Christmas product keeps the pine and cream; the rest wear the brand
		// skin (`+layout.svelte`).
		festive: Boolean(page.christmas),
		// The colour the picker shows chosen before anyone chooses.
		leadDesign: page.leadDesign ?? null,
		slug,
		currency: catalogue.currency,
		// The manifest is content, not metadata: the title and description that
		// reach search and social come from the catalogue, in the visitor's
		// locale, the same as they did before this page was blocks.
		seo: {
			title: catalogue.title,
			description: catalogue.description ?? '',
			priceCents: catalogue.priceCents,
			image: product.image
		}
	};
};
