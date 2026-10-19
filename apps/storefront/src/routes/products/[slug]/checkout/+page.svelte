<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import type { TrackFn } from '@funnel/core';
	import { toAmount } from 'ecomwithai/marketing';
	import { track as pixel } from '$lib/analytics/pixel';
	import { amount, pushEcommerce } from '$lib/analytics/datalayer';
	import Checkout from '$lib/components/Checkout.svelte';
	import { countryOptions } from '$lib/countries';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { sessionFunnelState } from '$lib/store/session-state.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { ActionData, PageData } from './$types';
	import '$lib/styles/shop-checkout.css';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	// The same key as the product page, so a colour and size chosen there are
	// still chosen here; and the same US default as `/checkout`.
	const { bag, state } = sessionFunnelState({
		country:
			countryOptions(page.data.locale ?? defaultLocale).find((c) => c.code === 'US')?.name ?? ''
	});

	/**
	 * A choice made somewhere else and carried here in the link: the product
	 * page's Add to cart sends `?design=green&size=M`, with `bundle=qty-2`
	 * when the buyer took a bundle. It wins over what
	 * the session remembers, because it is what the buyer just tapped, and it
	 * is set before any block mounts, so the picker renders folded on the
	 * server as well. Only codes this product sells are taken.
	 *
	 * `added=1` says the page that sent them already reported the AddToCart
	 * (the product page does, under its own event id, the moment Add to cart
	 * is tapped). Reporting it again here would count one add twice on the very
	 * event the Christmas ad set optimises for, so this page stays quiet about
	 * adds for the rest of the view, even if the buyer changes the size. The
	 * sender reported the product view too, so this page skips its own.
	 */
	const linked = (() => {
		const params = page.url.searchParams;
		const design = params.get('design') ?? '';
		const size = params.get('size') ?? '';
		const entry = data.variantIndex.find((v) => v.colourCode === design && v.size === size);
		if (!entry) return null;
		state.set('design', design);
		state.set('size', size);
		// The bundle the product page's cards showed, so the count is that one.
		const bundle = params.get('bundle') ?? '';
		if (data.tiered && /^qty-\d+$/.test(bundle)) state.set(data.tierField, bundle);
		return { reported: params.get('added') === '1' };
	})();

	/**
	 * Then the link's own parameters leave the address bar, so the buyer sees,
	 * copies and shares the page's plain address (the owner's call,
	 * 2026-10-18). Nothing is lost: the choice is in the session state above,
	 * which is what a reload restores from, and the server already rendered
	 * the picker folded. An ad's `fbclid` and utm tags stay where they are.
	 * `added=1` survives a reload in the session instead (`reported` below).
	 *
	 * On the next tick: on a page opened straight from a link, the router is
	 * still starting when mount and even `afterNavigate` run, and
	 * `replaceState` throws there, which stops the page hydrating at all.
	 */
	/**
	 * Whether the product page already reported this view and add: `added=1`
	 * in the link, or, once that has left the address bar, a reload of the
	 * page it arrived on. The session remembers it per product, and only a
	 * reload reads it back, so a later arrival without `added=1` (an ad
	 * landing here) reports as it should.
	 */
	const reported = (() => {
		const REPORTED_KEY = `checkout-reported:${data.slug}`;
		if (linked?.reported) {
			if (browser) {
				try {
					sessionStorage.setItem(REPORTED_KEY, '1');
				} catch {
					/* storage blocked: a reload simply reports again */
				}
			}
			return true;
		}
		if (!browser) return false;
		const load = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
		const reload = load?.type === 'reload' && new URL(load.name).pathname === page.url.pathname;
		try {
			// An arrival of its own (not a reload) starts the page's count afresh.
			if (!reload) sessionStorage.removeItem(REPORTED_KEY);
			return reload && sessionStorage.getItem(REPORTED_KEY) === '1';
		} catch {
			return false;
		}
	})();

	const OWN_PARAMS = ['design', 'size', 'bundle', 'added'];
	afterNavigate(() => {
		const url = new URL(page.url);
		if (!OWN_PARAMS.some((key) => url.searchParams.has(key))) return;
		for (const key of OWN_PARAMS) url.searchParams.delete(key);
		setTimeout(() => replaceState(url, page.state));
	});

	/**
	 * An ad can land here, so this is a product view as much as the product
	 * page is: the same ViewContent, once, with the same ids. Not when the
	 * buyer came from a page that already counted the view (`added=1`).
	 */
	let viewTracked = reported;
	$effect(() => {
		if (viewTracked) return;
		viewTracked = true;
		pixel('ViewContent', {
			content_type: 'product',
			content_ids: [data.slug],
			currency: data.currency,
			value: toAmount(data.seo.priceCents)
		});
		pushEcommerce('view_item', {
			currency: data.currency,
			value: amount(data.seo.priceCents),
			items: [
				{
					item_id: data.slug,
					item_name: data.seo.title,
					price: amount(data.seo.priceCents),
					quantity: 1
				}
			]
		});
	});

	/**
	 * Whether the buyer has touched the picker on this page view. Choices
	 * restored from the product page fill the cart too, but they were added
	 * there, and reporting them again would count one add twice.
	 */
	let picked = false;
	const track: TrackFn = (event) => {
		if (event === 'design_selected' || event === 'size_selected' || event === 'bundle_selected') {
			picked = true;
		}
	};

	/**
	 * The variant and count the picker shows, read from the state it writes.
	 * The design falls back to the first one, as the picker's own display does;
	 * the size never does, because it is the pet's and only the buyer knows it
	 * (unless there is only one).
	 * Tier ids are the host's own `qty-N` from `$lib/store/bundles.ts`.
	 */
	let wanted = $derived.by(() => {
		// The picker's own default when nothing was chosen: the lead design
		// (`leadDesign` in pages.ts), else the catalogue's first. The two must
		// agree, or a buyer who leaves the shown colour as it is gets another.
		const design = bag.design || data.leadDesign || data.variantIndex[0]?.colourCode || '';
		// A one-size product's size is chosen already, whatever another page left.
		const size = data.oneSize ?? bag.size;
		const entry = data.variantIndex.find((v) => v.colourCode === design && v.size === size);
		if (!entry) return null;
		const tier = data.tiered ? /^qty-(\d+)$/.exec(bag[data.tierField] ?? '') : null;
		// null: no bundle cards, so the count is whatever the buyer set in the
		// summary, kept across a change of size (read below, untracked).
		return { entry, units: tier ? Number(tier[1]) : data.tiered ? 1 : null };
	});

	/**
	 * Choosing is adding: the cart holds exactly what the picker shows, so the
	 * total under the pay button is what was chosen above it. Anything else in
	 * the cart is left alone and charged with it, as `/checkout` would. With no
	 * size chosen this product's line comes out, rather than charging for a
	 * size the page isn't showing.
	 *
	 * The cart is read untracked: this effect writes it, and reading what it
	 * writes would re-run it.
	 */
	let addReported = reported;
	$effect(() => {
		if (!cart.hydrated) return;
		const want = wanted;
		untrack(() => {
			// This product's lines by variant as well as by slug: a line carted
			// before a rename still carries the old slug, and keeping it as
			// "another product" put the same variant in the cart twice.
			const own = new Set(data.variantIndex.map((v) => v.variantId));
			const isMine = (l: { slug: string; variantId: number }) => l.slug === data.slug || own.has(l.variantId);
			const mine = cart.lines.filter(isMine);
			const units = want ? (want.units ?? mine[0]?.quantity ?? 1) : 0;
			const unchanged = want
				? mine.length === 1 &&
					mine[0].variantId === want.entry.variantId &&
					mine[0].quantity === units
				: mine.length === 0;
			if (unchanged) return;

			const others = cart.lines.filter((l) => !isMine(l));
			const next = want
				? [
						{
							variantId: want.entry.variantId,
							slug: data.slug,
							colour: want.entry.colourCode,
							size: want.entry.size,
							unitPriceCents: want.entry.unitPriceCents,
							quantity: units
						}
					]
				: [];
			cart.replace([...others, ...next]);

			// One AddToCart per page view, for the first choice that puts the
			// product in the cart. Trying M after S is the same add changing its
			// mind, and a campaign optimising on adds should not see two.
			if (!want || !picked || addReported) return;
			addReported = true;
			const { entry } = want;
			pixel('AddToCart', {
				content_type: 'product',
				content_ids: [entry.sku],
				contents: [{ id: entry.sku, quantity: units, item_price: entry.unitPriceCents / 100 }],
				num_items: units,
				currency: data.currency,
				value: toAmount(entry.unitPriceCents * units)
			});
			pushEcommerce('add_to_cart', {
				currency: data.currency,
				value: amount(entry.unitPriceCents * units),
				items: [
					{
						item_id: entry.sku,
						item_name: data.seo.title,
						item_variant: `${entry.colourCode} / ${entry.size}`,
						price: amount(entry.unitPriceCents),
						quantity: units
					}
				]
			});
		});
	});
</script>

<svelte:head>
	<!-- Not the product page's title: Google Analytics' page reports group by
	     title, and the same one put the payment page inside the product's row. -->
	<title>{t('checkout.title')} · {data.seo.title} · {t('common.brand')}</title>
	<meta name="description" content={data.seo.description} />
	<!-- Absolute: Facebook and Instagram resolve link previews from their own
	     servers, not from this page. -->
	<meta property="og:image" content={new URL(data.seo.image, page.url).href} />
	<!-- The product page is the one to index; this is its checkout. -->
	<meta name="robots" content="noindex, nofollow" />
	{#if data.look === 'shop'}
		<!-- Inter, the type of the hosted shop checkouts this look follows. -->
		<link
			href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
			rel="stylesheet"
		/>
	{:else}
		<link
			href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
			rel="stylesheet"
		/>
	{/if}
</svelte:head>

<Checkout
	{data}
	{form}
	{bag}
	funnelState={state}
	{track}
	initiateKey="one-page:{data.slug}"
	initiateAfterContact
	continueHref="/products/{data.slug}"
	emptyNote={t('checkout.pickAbove')}
	rowClass="max-w-page px-gutter mx-auto w-full"
	colClass="flex flex-col gap-3 md:gap-5"
	topSummary={false}
	mainClass="flex flex-col gap-6 pb-8"
	look={data.look === 'shop' ? 'shop' : 'default'}
	pickerSlug={data.slug}
	pickerSetsQuantity={data.tiered}
/>
