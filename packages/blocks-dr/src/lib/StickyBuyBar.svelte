<script lang="ts">
	import { onMount } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `sticky_buy_bar` — the dock that follows the visitor down the page.
	 *
	 * Exists because the buy decision happens somewhere other than the buy box:
	 * someone reads the reviews, the FAQ, the guarantee, and by then the price and
	 * the button are two screens up. This keeps both one tap away without
	 * duplicating the buy box's variant logic — it restates the current selection
	 * and forwards the same `add_to_cart` intent.
	 *
	 * Every number in it is `$ref`-able, and should be. A price restated as a
	 * literal here is a price that disagrees with the buy box above it.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			image?: string;
			alt?: string;
			title?: string;
			/** The chosen variant, e.g. "Sailboat / XS". */
			variant?: string;
			price?: string;
			compareAt?: string;
			/**
			 * Mirror a `bundles` selection instead of restating a fixed price.
			 *
			 * Pass the same tier list the picker got, plus the host-state key it
			 * writes the chosen id to. Without this the dock shows one price while
			 * the picker above it sells another — two buttons quoting different
			 * numbers for the same click, which is the sort of thing that ends in a
			 * chargeback rather than a bug report.
			 *
			 * Anything resolved this way wins over the literal props above; those
			 * stay as the fallback for a single-SKU page with no picker.
			 */
			tiers?: Array<{ id?: string; title?: string; price?: string; compareAt?: string; image?: string; alt?: string }>;
			selectionField?: string;
			cta?: string;
			action?: string;
			/** Button fill. Brand data, like the announcement tones. */
			accent?: string;
			accentText?: string;
			/**
			 * Pixels scrolled before it appears. Defaults to one viewport height,
			 * which adapts to the device instead of guessing a number — the bar is
			 * meant to arrive once the real buy box is behind you.
			 */
			showAfter?: number | 'always';
			/**
			 * Pad the document by the bar's height while it's up. On by default: the
			 * bar is `fixed`, so without it the last thing on the page — usually the
			 * footer, sometimes a legal disclosure — sits underneath it permanently.
			 */
			reserveSpace?: boolean;
			edge?: 'floating' | 'full';
		}
	);

	/**
	 * Reads host state on every evaluation, so it tracks the picker live — which
	 * only works if the host's adapter is backed by reactive state, as the
	 * contract asks. A plain object there leaves the dock frozen on the default.
	 */
	const selected = $derived.by(() => {
		if (!p.tiers?.length) return null;
		const id = ctx.state.get(p.selectionField ?? 'bundle');
		return p.tiers.find((t) => t.id === id) ?? null;
	});

	const title = $derived(selected?.title ?? p.title);
	const price = $derived(selected?.price ?? p.price);
	const compareAt = $derived(selected?.compareAt ?? p.compareAt);
	const image = $derived(selected?.image ?? p.image);
	const alt = $derived(selected?.alt ?? p.alt);

	const cta = $derived(p.cta ?? 'Add to cart');
	const accent = $derived(p.accent ?? '#1d64f2');
	const floating = $derived((p.edge ?? 'floating') === 'floating');

	let visible = $state(false);
	let bar = $state<HTMLElement | null>(null);

	onMount(() => {
		if (p.showAfter === 'always') {
			visible = true;
			return;
		}
		let frame = 0;
		const threshold = () => (typeof p.showAfter === 'number' ? p.showAfter : window.innerHeight);
		const read = () => {
			frame = 0;
			visible = window.scrollY > threshold();
		};
		// rAF-throttled: scroll fires far faster than paint, and a layout read per
		// event is the classic way a sticky bar makes a phone feel slow.
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(read);
		};
		read();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};
	});

	// Reserving space means writing to the host document, which a block otherwise
	// never does — but a fixed overlay that covers the footer is worse, and every
	// storefront that ships one of these ships a spacer with it.
	//
	// The original value is captured ONCE. Reading it per run means that after the
	// first show, "previous" is the padding this effect itself wrote, and hiding
	// the bar restores the spacer instead of removing it.
	let originalPad: string | null = null;
	$effect(() => {
		if (p.reserveSpace === false || typeof document === 'undefined') return;
		const body = document.body;
		if (originalPad === null) originalPad = body.style.paddingBottom;
		// `offsetHeight` of the outer element already includes the floating inset —
		// adding the inset again double-counts it and leaves a visible gap under
		// the page.
		body.style.paddingBottom = visible && bar ? `${bar.offsetHeight}px` : originalPad;
		return () => {
			if (originalPad !== null) body.style.paddingBottom = originalPad;
		};
	});

	let announced = false;
	$effect(() => {
		if (visible && !announced) {
			announced = true;
			ctx.track('sticky_bar_shown');
		}
	});

	function add() {
		ctx.submit(p.action ?? 'add_to_cart', {
			bundle: selected?.id,
			title: title,
			variant: p.variant,
			price: price,
			source: 'sticky_bar'
		});
		ctx.track('add_to_cart_click', { source: 'sticky_bar' });
	}
</script>

{#if title || price}
	<div
		bind:this={bar}
		class="fixed right-0 bottom-0 left-0 z-40 transition-[transform,opacity] duration-200 {floating
			? 'p-4'
			: ''} {visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'}"
		aria-hidden={!visible}
	>
		<div
			class="mx-auto flex w-full max-w-[1300px] items-center gap-3 bg-white {floating
				? 'rounded-card shadow-[0_8px_30px_rgba(0,0,0,0.14)] px-3 py-3'
				: 'shadow-[0_-1px_10px_rgba(0,0,0,0.2)] px-gutter py-3'}"
		>
			{#if image}
				<img
					src={image}
					alt={alt ?? ''}
					class="rounded-field size-12 shrink-0 object-cover"
					loading="lazy"
				/>
			{/if}

			<!--
				Dropped below `sm`. A 358pt card minus a thumbnail, a price and a
				tappable CTA leaves about one character for the name — it rendered as
				a lone "V". The page above already says what the product is; what the
				dock has to carry is the price and the button, so on a phone it
				carries those and nothing else.

				min-w-0 so the name truncates rather than pushing the button off-screen
				once there IS room for it.
			-->
			<div class="hidden min-w-0 flex-1 sm:block">
				{#if title}
					<p class="text-17 text-fx-ink truncate font-semibold">{title}</p>
				{/if}
				{#if p.variant}
					<p class="text-15 text-fx-sub truncate">{p.variant}</p>
				{/if}
			</div>

			{#if price}
				<p class="text-17 flex shrink-0 items-baseline gap-2 tabular-nums max-sm:flex-1">
					<span class="text-fx-ink font-semibold">{price}</span>
					{#if compareAt}
						<span class="text-fx-muted line-through">{compareAt}</span>
					{/if}
				</p>
			{/if}

			<button
				type="button"
				onclick={add}
				class="rounded-field text-17 flex shrink-0 items-center gap-2 px-5 py-3 font-semibold transition-opacity hover:opacity-90"
				style:background={accent}
				style:color={p.accentText ?? '#ffffff'}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="size-5 shrink-0"
					aria-hidden="true"
				>
					<path d="M6 8h12l-1 11H7zM9 8V6a3 3 0 0 1 6 0v2M12 12v4M10 14h4" />
				</svg>
				<span class="whitespace-nowrap">{cta}</span>
			</button>
		</div>
	</div>
{/if}

<style>
	@media (prefers-reduced-motion: reduce) {
		div {
			transition: none;
		}
	}
</style>
