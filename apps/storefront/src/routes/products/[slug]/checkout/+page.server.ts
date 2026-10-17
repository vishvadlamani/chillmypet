import { error } from '@sveltejs/kit';
import { bindDefinition, createRefResolver } from '@funnel/core';
import { loadBundles } from '$lib/store/bundles';
import { loadChristmasDelivery } from '$lib/store/christmas';
import { onePageCheckout } from '$lib/store/one-page-checkout';
import { PRODUCT_PAGES } from '$lib/store/pages';
import { loadProduct } from '$lib/store/product';
import { loadVariantPicker, variantEntries } from '$lib/store/variants';
import { placeOrder } from '$lib/server/checkout';
import { checkoutPayment, checkoutSources } from '$lib/server/checkout-page';
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
	const page = pageFor(slug);

	const [product, bundles, catalogue] = await Promise.all([
		loadProduct(commerce, locale, slug),
		loadBundles(commerce, locale, slug),
		commerce.catalog.getProduct(slug, locale)
	]);
	if (!product || !catalogue) error(404, `No product at "${slug}"`);

	const picker = page.manifest.blocks.find((b) => b.component === 'design_size_picker');
	const tierField = String(picker?.props?.tierField ?? 'bundle');

	const resolve = createRefResolver({
		...checkoutSources(locals),
		product,
		// The same tiers the product page's cards show: no "was" total.
		bundles: { ...bundles, plain: bundles.tiers.map(({ compareAt: _, ...tier }) => tier) },
		variants: loadVariantPicker(catalogue, locale),
		christmas: page.theme ? loadChristmasDelivery(settings) : {}
	});
	// The composed manifest is authored, not data: it is the same for every
	// request to this slug, so versioning it before binding keeps one version
	// per page rather than one per price or stock change.
	const { definition, version } = bindDefinition(onePageCheckout(page.manifest, slug), resolve);

	return {
		definition,
		version,
		...checkoutPayment(locals, url),
		slug,
		tierField,
		// The host's lookup from the picker's codes to a variant. Never a prop:
		// a block that carried variant ids would be coupled to this catalogue.
		variantIndex: variantEntries(catalogue),
		currency: catalogue.currency,
		seo: {
			title: catalogue.title,
			description: catalogue.description ?? '',
			priceCents: catalogue.priceCents,
			image: product.image
		}
	};
};

export const actions: Actions = {
	// The same order, the same intent and the same webhook as `/checkout`. A
	// buyer who backs out of Stripe's hosted page comes back here, to the page
	// they left.
	default: (event) => {
		pageFor(event.params.slug);
		return placeOrder(event, { cancelPath: `/products/${event.params.slug}/checkout` });
	}
};
