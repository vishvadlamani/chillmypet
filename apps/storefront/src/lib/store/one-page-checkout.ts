import type { Block, FunnelDefinition } from '@funnel/core';
import { CHECKOUT_PAGE } from './checkout-manifest';

/**
 * A product's one-page checkout: choose and pay on the same page.
 *
 * `/products/<slug>` sends a buyer to `/checkout` after they choose. This is
 * the other shape, `/products/<slug>/checkout`, for an ad that should land
 * on the form itself: the product's own delivery strip, photos, title and
 * picker on top, the checkout's contact, address and shipping blocks under
 * them, and the same card fields and pay button below that.
 *
 * Composed from the two manifests rather than authored a third time, so the
 * picker's words, sizes and bundle cards are the product page's and cannot
 * drift from it, and the checkout's fields are the checkout's. The result is
 * still static per product, so binding it versions an authored manifest, the
 * same as the other two pages.
 */

/** What comes across from the product page, in the order it renders. */
const FROM_PRODUCT = new Set(['announcement_bar', 'design_gallery', 'design_size_picker']);

export function onePageCheckout(product: FunnelDefinition, slug: string): FunnelDefinition {
	const top = product.blocks.flatMap((block): Block[] => {
		const isTitle = block.component === 'heading' && block.props?.level === 1;
		if (!FROM_PRODUCT.has(block.component) && !isTitle) return [];
		// The product page sets these side by side; here they stack in one
		// row, which the page gives the checkout's width and gutter. The strip
		// stays outside it, edge to edge.
		const { layout: _, ...bare } = block;
		const rest: Block =
			block.component === 'announcement_bar' ? bare : { ...bare, layout: { row: 'product' } };
		if (block.component !== 'design_size_picker') return [rest];
		return [
			{
				...rest,
				props: {
					...rest.props,
					// Choosing IS adding here: the host fills the cart from the
					// picker's state, and the only button is the one that pays.
					button: false,
					// The guide lives on the product page, not on this one.
					sizeGuideHref: `/products/${slug}#size-guide`
				}
			}
		];
	});

	return {
		...CHECKOUT_PAGE,
		id: `${product.id}-checkout`,
		name: `${product.name} — one-page checkout`,
		// The product's title is this page's h1; a second "Checkout" h1 under
		// it would make two.
		blocks: [...top, ...CHECKOUT_PAGE.blocks.filter((b) => b.id !== 'checkout-title')]
	};
}
