/*
 * What is left of the two landing pages that sold the hoodies, both taken
 * down on 2026-10-18 (the owner's call):
 *
 *   chillmypet-christmas.pages.dev  the Christmas Pouch Hoodie's page
 *   chillmypet-hoodie.pages.dev     the Pouch Pet Hoodie's, off sale since 9 Oct
 *
 * Neither sells, tracks or reports anything any more. Every page request goes
 * to the Pet Christmas Tree Costume on chillmypet.com, the product the
 * Christmas ad sells, so a link left in an old ad, a bio or a bookmark still
 * reaches something on sale. No pixel runs here: the costume's page fires its
 * own PageView, and a second one from a page nobody sees only muddied the
 * numbers in Events Manager.
 *
 * 302, not 301: a browser caches a permanent redirect, and these addresses
 * may serve something else one day. The query string goes along, so an ad
 * click's fbclid and utm tags reach chillmypet.com's pixel, less the design
 * and size the hoodie pages put in their own links.
 *
 * /api/* answers 410 Gone. That covers the old pages' Conversions API beacons
 * and the Stripe webhook the Christmas page had (/api/stripe-webhook): its
 * endpoint and the hoodies' Payment Links are to be removed in Stripe, and a
 * delivery that still arrives should fail loudly in Stripe's Dashboard, not be
 * accepted and lost.
 */
export const SELLING_INSTEAD = 'https://chillmypet.com/products/christmas-tree-costume';

/** Choices the hoodie pages put in their links; they name nothing on the costume. */
const THEIR_OWN_CHOICES = ['design', 'size', 'added'];

export default {
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname.startsWith('/api/')) return new Response('Gone', { status: 410 });
		for (const key of THEIR_OWN_CHOICES) url.searchParams.delete(key);
		return Response.redirect(SELLING_INSTEAD + url.search, 302);
	}
};
