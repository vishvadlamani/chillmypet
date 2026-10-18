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
	import '$lib/styles/tree-theme.css';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let tree = $derived(data.theme === 'tree');
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
			String(payload.design ?? '') || bag.design || data.leadDesign || data.variantIndex[0]?.colourCode || '';
		const size = String(payload.size ?? '') || bag.size || '';
		const entry = data.variantIndex.find((v) => v.colourCode === design && v.size === size);
		if (!entry) {
			// A fresh token each time, so a second tap prompts again.
			funnelState.set('size_prompt', String(Date.now()));
			return;
		}
		// The picker states the count; the sticky bar sends the id of the tier it
		// is showing. Either way it is the tier the buyer can see, or one.
		const units = unitsFrom(payload);

		cart.add(
			{
				variantId: entry.variantId,
				slug: data.slug,
				colour: entry.colourCode,
				size: entry.size,
				unitPriceCents: entry.unitPriceCents
			},
			units
		);

		// The same event_id scheme as every other event: `pixel()` mints one id
		// and sends it with both the browser event and its /api/track copy. The
		// SKU names the colour and size (CMP-XT-GREEN-M), so Events Manager
		// and GA4 show what was chosen without a lookup table.
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

		// A product with its own payment page (`checkout: 'shop'`) opens it on
		// what was just chosen: the link carries it, so the page renders folded
		// from the server, and `added=1` stops it reporting this add again.
		if (data.payAt === '/checkout') return void goto('/checkout');
		const link = new URLSearchParams({ design: entry.colourCode, size: entry.size });
		if (units > 1) link.set('bundle', `qty-${units}`);
		link.set('added', '1');
		goto(`${data.payAt}?${link}`);
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
			// The `typeof` sits inside the try because merely touching the global
			// throws a SecurityError where the browser blocks site data (Safari's
			// "Block All Cookies", some in-app browsers). Outside it, that crashed
			// this page on hydration and took the picker and Add to cart with it.
			try {
				if (typeof sessionStorage === 'undefined') return {};
				return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
			} catch {
				return {};
			}
		})()
	);
	const persist = () => {
		try {
			sessionStorage.setItem(KEY, JSON.stringify(bag));
		} catch {
			// Blocked or full: the state still lives in `bag` for this page view.
		}
	};

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
	{#if tree}
		<!-- The layout loads the font: Poppins for a Christmas page, the brand's
		     DM Sans for the rest. The og:image is absolute: Instagram and
		     Facebook resolve link previews from their own servers, not from
		     this page. -->
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

<PageLayout
	definition={data.definition}
	version={data.version}
	components={STORE_BLOCKS}
	{track}
	{submit}
	state={funnelState}
	rootClass={tree ? 'tree-theme min-h-svh' : 'storefront-type bg-fx-bg min-h-svh'}
	rowClass={tree
		? 'tree-row mx-auto grid w-full max-w-[1320px] gap-4 px-[18px] py-6 md:grid-cols-2 md:gap-14 md:px-[72px] md:py-12'
		: 'mx-auto grid w-full max-w-shell gap-8 px-gutter py-6 md:grid-cols-[715fr_537fr] md:gap-12'}
	colClass={tree ? 'flex min-w-0 flex-col gap-3 md:gap-5' : 'flex flex-col gap-6'}
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
