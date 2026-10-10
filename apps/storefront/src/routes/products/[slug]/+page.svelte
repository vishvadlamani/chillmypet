<script lang="ts">
	import { goto } from '$app/navigation';
	import PageLayout from '@funnel/core/PageLayout.svelte';
	import { STORE_BLOCKS } from '$lib/store/blocks';
	import type { FunnelStateAdapter, SubmitFn, TrackFn } from '@funnel/core';
	import { toAmount } from 'ecomwithai/marketing';
	import { page } from '$app/state';
	import { track as pixel } from '$lib/analytics/pixel';
	import { amount, pushEcommerce } from '$lib/analytics/datalayer';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let christmas = $derived(data.theme === 'christmas');

	// Fixed positions rather than Math.random(): the server and the browser have
	// to render the same flakes, or hydration repaints them.
	const FLAKES = Array.from({ length: 18 }, (_, i) => ({
		x: (i * 37 + 11) % 100,
		size: 10 + ((i * 7) % 12),
		fall: 14 + ((i * 5) % 10),
		delay: (i * 3.7) % 20,
		y: (i * 23 + 5) % 95
	}));
	let t = $derived(createTranslator(locale));

	/**
	 * No block emits a ViewContent — the block vocabulary describes what happened
	 * on the page, and which of those moments is a conversion event is the host's
	 * call. This is the campaign's landing page, so it fires here, once, with the
	 * ids the ad account already knows.
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
	 * Block events describe what happened on the page — `bundle_selected`,
	 * `sticky_bar_shown`, `accordion_open`. None of them is one of Meta's, and
	 * the two moments that are (arriving, adding to cart) are fired by the host
	 * either side of this, where the cart and the total are known. Forwarding
	 * unmapped names would fill the ad account with events no campaign
	 * optimises against.
	 */
	const track: TrackFn = () => {};

	/**
	 * How many units the visitor is buying.
	 *
	 * The bundle picker says so outright. The sticky bar doesn't — it restates
	 * whatever the picker chose and sends only the tier id, so the count is read
	 * back out of it. Those ids are minted by the host in `$lib/store/bundles.ts`
	 * as `qty-N`, so this parses the host's own format, not a block's.
	 *
	 * Getting this wrong is a real order: someone picks the 3-pack, scrolls, taps
	 * the bar, and buys one.
	 */
	function unitsFrom(payload: Record<string, unknown>): number {
		const stated = Number(payload.units);
		if (Number.isFinite(stated) && stated > 0) return Math.floor(stated);
		const tier = /^qty-(\d+)$/.exec(String(payload.bundle ?? ''));
		return tier ? Number(tier[1]) : 1;
	}

	/**
	 * The blocks state intent and stop. Turning "add_to_cart" into cart lines and
	 * a destination is the host's job — which is why `submit` is fire-and-forget
	 * and hands over the whole selection.
	 */
	const submit: SubmitFn = (action, _subject, payload = {}) => {
		if (action !== 'add_to_cart') return;
		if (data.pickSize) return addChosenVariant(payload);

		const units = unitsFrom(payload);
		// The bundle picker sends one colour per unit; the sticky bar sends none.
		const picks = Array.isArray(payload.variants) ? (payload.variants as string[]) : [];
		const chosen = picks.length ? picks.slice(0, units) : Array(units).fill(undefined);

		const added: { sku: string; unitPriceCents: number }[] = [];
		for (const label of chosen) {
			const entry = data.variantIndex.find((v) => v.colour === label) ?? data.variantIndex[0];
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
			added.push({ sku: entry.sku, unitPriceCents: entry.unitPriceCents });
		}

		// Reported here rather than off the block's `add_to_cart_click`, which
		// carries no quantity: a 3-pack has to be worth three units to the
		// campaign, or bidding optimises against a number that isn't the sale.
		if (added.length > 0) {
			pixel('AddToCart', {
				content_type: 'product',
				content_ids: added.map((l) => l.sku),
				contents: added.map((l) => ({ id: l.sku, quantity: 1, item_price: l.unitPriceCents / 100 })),
				num_items: added.length,
				currency: data.currency,
				value: toAmount(added.reduce((sum, l) => sum + l.unitPriceCents, 0))
			});
			pushEcommerce('add_to_cart', {
				currency: data.currency,
				value: amount(added.reduce((sum, l) => sum + l.unitPriceCents, 0)),
				items: added.map((l) => ({
					item_id: l.sku,
					price: amount(l.unitPriceCents),
					quantity: 1
				}))
			});
		}

		// Where intent goes is the host's decision, not a block prop. A `href` on
		// the bundle picker would put routing in the manifest and fork the block
		// contract permanently.
		goto('/checkout');
	};

	/**
	 * Add to cart where the buyer picks design AND size.
	 *
	 * The picker sends both codes; the sticky bar sends neither, so they are read
	 * back out of the same state the picker writes. With no size there is nothing
	 * safe to add: the picker is asked to prompt, and nothing is tracked, because
	 * an AddToCart for a cart that didn't change is a number the campaign would
	 * optimise against.
	 */
	function addChosenVariant(payload: Record<string, unknown>) {
		const design =
			String(payload.design ?? '') || bag.design || data.variantIndex[0]?.colourCode || '';
		const size = String(payload.size ?? '') || bag.size || '';
		const entry = data.variantIndex.find((v) => v.colourCode === design && v.size === size);
		if (!entry) {
			// A fresh token each time, so a second tap prompts again.
			funnelState.set('size_prompt', String(Date.now()));
			return;
		}

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

		// The same event_id scheme as every other event: `pixel()` mints one id
		// and sends it with both the browser event and its /api/track copy. The
		// SKU names the design and size (CMP-XH-SANTA-RED-M), so Events Manager
		// and GA4 show what was chosen without a lookup table.
		pixel('AddToCart', {
			content_type: 'product',
			content_ids: [entry.sku],
			contents: [{ id: entry.sku, quantity: 1, item_price: entry.unitPriceCents / 100 }],
			num_items: 1,
			currency: data.currency,
			value: toAmount(entry.unitPriceCents)
		});
		pushEcommerce('add_to_cart', {
			currency: data.currency,
			value: amount(entry.unitPriceCents),
			items: [
				{
					item_id: entry.sku,
					item_name: data.seo.title,
					item_variant: `${entry.colourCode} / ${entry.size}`,
					price: amount(entry.unitPriceCents),
					quantity: 1
				}
			]
		});

		goto('/checkout');
	}

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
	<title>{data.seo.title} · {t('common.brand')}</title>
	<meta name="description" content={data.seo.description} />
	{#if christmas}
		<!-- Fredoka for the Christmas page, scoped like Poppins below: only this
		     page pays for it. -->
		<link
			href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap"
			rel="stylesheet"
		/>
		<!-- Absolute: Instagram and Facebook resolve link previews from their own
		     servers, not from this page. -->
		<meta property="og:image" content={new URL(data.seo.image, page.url).href} />
	{:else}
		<!-- Poppins only on the storefront. Loaded here rather than in app.html so
		     the rest of the site doesn't pay for a font it never renders. -->
		<link
			href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
			rel="stylesheet"
		/>
	{/if}
</svelte:head>

{#if christmas}
	<!-- Decoration only: behind the content, never in the accessibility tree,
	     and still under prefers-reduced-motion. -->
	<div class="snowfall" aria-hidden="true">
		{#each FLAKES as flake, i (i)}
			<span
				style:left="{flake.x}%"
				style:font-size="{flake.size}px"
				style:animation-duration="{flake.fall}s"
				style:animation-delay="-{flake.delay}s"
				style:--y="{flake.y}%">❄</span
			>
		{/each}
	</div>
{/if}

<PageLayout
	definition={data.definition}
	version={data.version}
	components={STORE_BLOCKS}
	{track}
	{submit}
	state={funnelState}
	rootClass={christmas
		? 'xmas-theme relative z-[1] min-h-svh'
		: 'storefront-type bg-fx-bg min-h-svh'}
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

	/*
	 * The Christmas skin, layered on the brand rather than replacing it: navy,
	 * teal and orange stay the working colours (text, selection, the buy
	 * button), and red, pine and snow are accents. The `--color-fx-*` lines
	 * re-point the library blocks' own tokens for this subtree only, the same
	 * trick as `--font-sans` above.
	 */
	:global(.xmas-theme) {
		--brand-navy: #0b3c49;
		--brand-teal: #14a3b0;
		--brand-orange: #ff6b2c;
		--xmas-red: #b3202a;
		--xmas-pine: #1f5f3f;
		--xmas-snow: #fffdf8;
		--color-fx-bg: transparent;
		--color-fx-ink: #0b3c49;
		--color-fx-sub: #24525e;
		--color-fx-surface: #eaf5f6;
		--color-fx-surface-hover: #dceff1;
		--font-sans: 'Fredoka', ui-rounded, ui-sans-serif, system-ui, sans-serif;
		font-family: var(--font-sans);
		color: var(--brand-navy);
		background:
			radial-gradient(circle at 12% 8%, rgb(20 163 176 / 0.08), transparent 40%),
			radial-gradient(circle at 88% 2%, rgb(179 32 42 / 0.07), transparent 35%),
			var(--xmas-snow);
	}
	:global(.xmas-theme h1) {
		color: var(--brand-navy);
	}
	/* A candy-cane rule under the delivery strip: the one loud festive line. */
	:global(.xmas-theme aside[aria-label='Announcement']) {
		border-bottom: 6px solid transparent;
		border-image: repeating-linear-gradient(
				-45deg,
				var(--xmas-red) 0 10px,
				var(--xmas-snow) 10px 20px
			)
			6;
	}

	.snowfall {
		position: fixed;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.snowfall span {
		position: absolute;
		top: -24px;
		color: #9fd8de;
		opacity: 0.55;
		animation-name: fall;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
	}
	@keyframes fall {
		to {
			transform: translate3d(24px, 110vh, 0) rotate(180deg);
		}
	}
	/* Still flakes, not none: the page keeps its look without the motion. */
	@media (prefers-reduced-motion: reduce) {
		.snowfall span {
			animation: none;
			top: var(--y);
		}
		.snowfall span:nth-child(odd) {
			display: none;
		}
	}
</style>
