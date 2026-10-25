import { error, redirect } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { loadBundles } from '$lib/store/bundles';
import { loadChristmasDelivery } from '$lib/store/christmas';
import { sizeGuideTable } from '$lib/store/garment-sizes';
import { onePageCheckout } from '$lib/store/one-page-checkout';
import { PRODUCT_PAGES, renamedRedirect, retiredRedirect } from '$lib/store/pages';
import { loadProduct } from '$lib/store/product';
import { loadVariantPicker, offeredDesigns, variantEntries } from '$lib/store/variants';
import { createTranslator } from '$lib/i18n';
import { placeOrder } from '$lib/server/checkout';
import { classicCheckoutSources, checkoutPayment, checkoutSources } from '$lib/server/checkout-page';
import type { Actions, PageServerLoad } from './$types';

/**
 * A product and its checkout on one page — see `$lib/store/one-page-checkout.ts`.
 *
 * `/products/<slug>` and `/checkout` stay exactly as they are; this is a
 * second way in, for an ad that should land on the form. Only products whose
 * buyer picks the size have one: their picker says outright which variant is
 * wanted, which is what lets choosing fill the cart without a button.
 */
function pageFor(slug: string) {
	const page = PRODUCT_PAGES[slug];
	if (!page?.pickSize) error(404, `No one-page checkout for "${slug}"`);
	return page;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { commerce, locale, settings } = locals;
	const slug = params.slug;
	// A product taken off sale sends its links on (`scripts/retired-products.js`):
	// to the product page, where a size is chosen again, not to its checkout.
	// A renamed product's old URL goes to its new one (`scripts/slug-changes.js`).
	const renamedTo = renamedRedirect(slug, url);
	if (renamedTo) redirect(308, renamedTo);
	const movedTo = retiredRedirect(slug, url);
	if (movedTo) redirect(308, movedTo);
	const page = pageFor(slug);

	const [product, bundles, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		// Only the designs this page sells (`designs` in pages.ts).
		commerce.catalog.getProduct(slug, locale).then((p) => p && offeredDesigns(p, page.designs))
	]);
	if (!product || !catalogue) error(404, `No product at "${slug}"`);
	// The product page's listing photo, as there (`cardImage` in pages.ts).
	if (page.cardImage) {
		product.image = page.cardImage;
		bundles.tiers = bundles.tiers.map((tier) => ({ ...tier, image: page.cardImage }));
	}

	const picker = page.manifest.blocks.find((b) => b.component === 'design_size_picker');
	const tierField = String(picker?.props?.tierField ?? 'bundle');
	// Whether the picker's bundle cards decide how many. When they don't, the
	// count is the buyer's to set in the summary.
	const tiered = Boolean(picker?.props?.tiers);

	const variantIndex = variantEntries(catalogue);
	const initialDesign = variantIndex.find((entry) => entry.colourCode === url.searchParams.get('design') && entry.size === url.searchParams.get('size'))?.colourCode ?? page.leadDesign ?? catalogue.options[0]?.values[0]?.value ?? '';
	const sizes = catalogue.options[1]?.values ?? [];
	const variants = loadVariantPicker(catalogue, locale, page.leadDesign);
	const classic = page.checkout === 'classic';
	const gallery = page.manifest.blocks.find((b) => b.component === 'design_gallery');
	const galleryPhotos = (gallery?.props?.photos ?? {}) as Record<string, { src?: string }>;
	const t = createTranslator(locale);
	const classicDelivery = classic ? classicCheckoutSources(locals, catalogue.currency) : null;

	const resolve = createRefResolver({
		...checkoutSources(locals),
		product,
		// The same tiers the product page's cards show: no "was" total.
		bundles: { ...bundles, plain: bundles.tiers.map(({ compareAt: _, ...tier }) => tier) },
		variants,
		christmas: page.christmas ? loadChristmasDelivery(settings) : {},
		classic: classicDelivery ?? {}
	});
	// The composed manifest is authored, not data: it is the same for every
	// request to this slug, so versioning it before binding keeps one version
	// per page rather than one per price or stock change.
	const { definition, version } = bindDefinition(
		onePageCheckout(page.manifest, slug, page.checkout),
		resolve
	);

	return {
		definition,
		version,
		...checkoutPayment(locals, url),
		slug,
		look: page.checkout ?? null,
		// The product's own skin and colours (the layout reads both), so the
		// Christmas costume's checkout looks like its product page.
		theme: page.theme ?? null,
		festive: Boolean(page.christmas),
		// The colour the picker shows chosen before anyone chooses.
		leadDesign: page.leadDesign ?? null,
		// The size, when the product comes in only one (the massager): the
		// picker shows no buttons for it, so it is chosen without a tap.
		oneSize: sizes.length === 1 ? sizes[0].value : null,
		tierField,
		tiered,
		// The host's lookup from the picker's codes to a variant. Never a prop:
		// a block that carried variant ids would be coupled to this catalogue.
		variantIndex,
		// The classic look's order panel: what its colour, size and quantity
		// selects offer. Host markup, not a block, because it sits beside the
		// priced cart that only the host has.
		order: classic
			? {
					title: catalogue.title,
					initialDesign,
					tagline: page.tagline ?? catalogue.subtitle ?? '',
					arrival: classicDelivery?.rates.find((rate) => rate.id === 'standard')?.detail ?? '',
					designLabel: String(picker?.props?.designLabel ?? t('checkout.classic.colour')),
					// The photo the product page's gallery shows for each colour,
					// which may be a worn shot standing in for a catalogue flat-lay.
					designs: variants.designs.map(({ code, label, image }) => ({
						code,
						label,
						image: galleryPhotos[code]?.src ?? image
					})),
					sizes: variants.sizes,
					available: variants.available,
					sizeNotes: sizeNotes(catalogue),
					// Quantity is the bundle tier: the same breaks the product page's
					// cards offer, priced by the server.
					quantities: tiered ? bundles.tiers.map((tier) => tier.units ?? 1) : [1]
				}
			: null,
		currency: catalogue.currency,
		seo: {
			title: catalogue.title,
			description: catalogue.description ?? '',
			priceCents: catalogue.priceCents,
			image: product.image
		}
	};
};

/** "M · 2.5–5 kg (6–11 lb)", per size, from the size guide's own table. */
function sizeNotes(product: Parameters<typeof sizeGuideTable>[0]): Record<string, string> {
	const table = sizeGuideTable(product);
	if (!table) return {};
	return Object.fromEntries(table.rows.map((row) => [row.size, `${row.size} · ${row.cells[0]}`]));
}

export const actions: Actions = {
	// The same order, the same intent and the same webhook as `/checkout`. A
	// buyer who backs out of Stripe's hosted page comes back here, to the page
	// they left.
	default: (event) => {
		pageFor(event.params.slug);
		return placeOrder(event, { cancelPath: `/products/${event.params.slug}/checkout` });
	}
};
