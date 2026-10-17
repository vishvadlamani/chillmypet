<script lang="ts">
	import { untrack } from 'svelte';
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

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	// The same key as the product page, so a colour and size chosen there are
	// still chosen here; and the same US default as `/checkout`.
	const { bag, state } = sessionFunnelState({
		country:
			countryOptions(page.data.locale ?? defaultLocale).find((c) => c.code === 'US')?.name ?? ''
	});

	/**
	 * An ad can land here, so this is a product view as much as the product
	 * page is: the same ViewContent, once, with the same ids.
	 */
	let viewTracked = false;
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
	 * the size never does, because it is the pet's and only the buyer knows it.
	 * Tier ids are the host's own `qty-N` from `$lib/store/bundles.ts`.
	 */
	let wanted = $derived.by(() => {
		const design = bag.design || data.variantIndex[0]?.colourCode || '';
		const entry = data.variantIndex.find((v) => v.colourCode === design && v.size === bag.size);
		if (!entry) return null;
		const tier = /^qty-(\d+)$/.exec(bag[data.tierField] ?? '');
		return { entry, units: tier ? Number(tier[1]) : 1 };
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
	let addReported = false;
	$effect(() => {
		if (!cart.hydrated) return;
		const want = wanted;
		untrack(() => {
			const mine = cart.lines.filter((l) => l.slug === data.slug);
			const unchanged = want
				? mine.length === 1 &&
					mine[0].variantId === want.entry.variantId &&
					mine[0].quantity === want.units
				: mine.length === 0;
			if (unchanged) return;

			const others = cart.lines.filter((l) => l.slug !== data.slug);
			const next = want
				? [
						{
							variantId: want.entry.variantId,
							slug: data.slug,
							colour: want.entry.colourCode,
							size: want.entry.size,
							unitPriceCents: want.entry.unitPriceCents,
							quantity: want.units
						}
					]
				: [];
			cart.replace([...others, ...next]);

			// One AddToCart per page view, for the first choice that puts the
			// product in the cart. Trying M after S is the same add changing its
			// mind, and a campaign optimising on adds should not see two.
			if (!want || !picked || addReported) return;
			addReported = true;
			const { entry, units } = want;
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
	<title>{data.seo.title} · {t('common.brand')}</title>
	<meta name="description" content={data.seo.description} />
	<!-- Absolute: Facebook and Instagram resolve link previews from their own
	     servers, not from this page. -->
	<meta property="og:image" content={new URL(data.seo.image, page.url).href} />
	<!-- The product page is the one to index; this is its checkout. -->
	<meta name="robots" content="noindex, nofollow" />
	<link
		href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
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
/>
