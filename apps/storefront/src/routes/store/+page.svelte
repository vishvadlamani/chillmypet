<script lang="ts">
	import { goto } from '$app/navigation';
	import PageLayout from '@funnel/core/PageLayout.svelte';
	import { DR_BLOCKS } from '@funnel/blocks-dr';
	import type { FunnelStateAdapter, SubmitFn, TrackFn } from '@funnel/core';
	import { toAmount } from 'ecomwithai/marketing';
	import { track as pixel } from '$lib/analytics/pixel';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Block events are named for what happened on the page; the pixel wants
	// Meta's vocabulary. Anything unmapped is a page event we simply don't
	// report — silently forwarding unknown names would pollute the ad account
	// with events no campaign optimises against.
	const PIXEL_EVENTS: Record<string, 'ViewContent' | 'AddToCart'> = {
		view_content: 'ViewContent',
		add_to_cart_click: 'AddToCart'
	};

	const track: TrackFn = (event, _subject, props) => {
		const mapped = PIXEL_EVENTS[event];
		if (!mapped) return;
		pixel(mapped, {
			content_type: 'product',
			content_ids: [data.slug],
			currency: data.currency,
			value: toAmount(data.variantIndex[0]?.unitPriceCents ?? 0),
			...(props as Record<string, never>)
		});
	};

	/**
	 * The blocks state intent and stop. Turning "add_to_cart" into cart lines and
	 * a destination is the host's job — which is why `submit` is fire-and-forget
	 * and hands over the whole selection.
	 */
	const submit: SubmitFn = (action, _subject, payload = {}) => {
		if (action !== 'add_to_cart') return;

		const units = Math.max(1, Number(payload.units ?? 1));
		// The bundle picker sends one colour per unit; the sticky bar sends none,
		// because it restates whatever the picker already chose.
		const picks = Array.isArray(payload.variants) ? (payload.variants as string[]) : [];
		const chosen = picks.length ? picks.slice(0, units) : Array(units).fill(undefined);

		for (const label of chosen) {
			const entry =
				data.variantIndex.find((v) => v.colour === label) ?? data.variantIndex[0];
			if (!entry) continue;
			cart.add(
				{
					variantId: entry.variantId,
					slug: data.slug,
					colour: entry.colourCode,
					size: entry.size,
					unitPriceCents: entry.unitPriceCents
				},
				1
			);
		}

		// Where intent goes is the host's decision, not a block prop. A `href` on
		// the bundle picker would put routing in the manifest and fork the block
		// contract permanently.
		goto('/store/checkout');
	};

	// Session-backed, because the top timer is evergreen: it writes its start on
	// first view and reads it back on every later one. A stub adapter would hand
	// each reload a fresh 15 minutes, which is the bug that makes evergreen
	// timers untrustworthy.
	const KEY = 'store-state';
	// `$state`, not a plain object. The adapter's reads are methods precisely so a
	// reactive host returns a live value on each call — blocks that mirror another
	// block's choice (the dock following the bundle picker) depend on that, and a
	// plain object leaves them frozen on whatever they saw first.
	const bag: Record<string, string> = $state(
		(() => {
			if (typeof sessionStorage === 'undefined') return {};
			try {
				return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
			} catch {
				return {};
			}
		})()
	);
	const persist = () => sessionStorage.setItem(KEY, JSON.stringify(bag));

	const funnelState: FunnelStateAdapter = {
		begin: () => {},
		get: (f) => bag[f] ?? '',
		set: (f, v) => {
			bag[f] = v;
			persist();
		},
		answer: (k) => bag[k] ?? '',
		setAnswer: (k, v) => {
			bag[k] = v;
			persist();
		},
		city: () => ''
	};
</script>

<svelte:head>
	<title>Store</title>
	<!--
		noindex while this is a work-in-progress on a production domain. The page
		currently quotes a price nothing can charge, shows placeholder photography
		and answers FAQs nobody has verified — none of which should turn up in
		search results under ideatorun.com. Delete this line when it's real.
	-->
	<!-- Poppins only on the storefront. Loaded here rather than in app.html so
	     /quiz and /checkout-dr* don't pay for a font they never render. -->
	<link
		href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout
	definition={data.definition}
	version={data.version}
	components={DR_BLOCKS}
	{track}
	{submit}
	state={funnelState}
	rootClass="storefront-type bg-fx-bg min-h-svh"
	rowClass="mx-auto grid w-full max-w-shell gap-8 px-gutter py-6 md:grid-cols-[715fr_537fr] md:gap-12"
	colClass="flex flex-col gap-6"
/>

<style>
	/*
	 * Redefines the token for THIS SUBTREE ONLY.
	 *
	 * `--font-sans` is global and the live funnel renders through the same
	 * stylesheet — changing it in layout.css would restyle /quiz, /lp and
	 * /checkout-dr*, which must keep rendering identically. Scoping it to the
	 * page's root element means everything inside inherits Poppins and nothing
	 * outside notices.
	 *
	 * `:global` because the element carrying this class is rendered by
	 * PageLayout, not by this component, so Svelte's scoping wouldn't reach it.
	 */
	:global(.storefront-type) {
		--font-sans: 'Poppins', ui-sans-serif, system-ui, sans-serif;
		font-family: var(--font-sans);
	}
</style>
