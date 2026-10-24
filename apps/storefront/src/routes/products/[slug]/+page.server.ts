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
import { PRODUCT_PAGES, renamedRedirect, retiredRedirect } from '$lib/store/pages';
import { loadVariantPicker, offeredDesigns, variantEntries } from '$lib/store/variants';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;

	// A product taken off sale sends its links on (`scripts/retired-products.js`).
	// A renamed product's old URL goes to its new one (`scripts/slug-changes.js`).
	const renamedTo = renamedRedirect(slug, url);
	if (renamedTo) redirect(308, renamedTo);
	const movedTo = retiredRedirect(slug, url);
	if (movedTo) redirect(308, movedTo);

	const page = PRODUCT_PAGES[slug];
	if (!page) error(404, `No page manifest for "${slug}" — add one in $lib/store/pages.ts`);

	// Every source is a live query. They run together because none depends on
	// another, and the page renders behind the slowest one either way.
	const [product, bundles, offer, sizeChart, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		loadOffer(commerce, locale, settings, slug),
		loadSizeChart(commerce, locale, slug),
		// Only the designs this page sells (`designs` in pages.ts).
		commerce.catalog.getProduct(slug, locale).then((p) => p && offeredDesigns(p, page.designs))
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
		// The life jacket's own chart (a title over its chart graphic), read
		// from the same metafield; a page that does not name it ignores it.
		sizeChart,
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
		// The size, when the product comes in only one (the massager): the
		// picker shows no buttons for it, so it is chosen without a tap.
		oneSize: page.pickSize && sizes.length === 1 ? sizes[0].value : null,
		// Where Add to cart sends the buyer: the product's own payment page
		// when it has one (`checkout` set in pages.ts), else the cart's.
		payAt: page.checkout ? `/products/${slug}/checkout` : '/checkout',
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
