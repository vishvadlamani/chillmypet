<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `media` — product gallery, video carousel, grid, or a single image.
	 *
	 * The fiddly parts are shared, so it's one block: aspect ratios reserved up
	 * front so nothing jumps while loading, keyboard-reachable slide changes, and
	 * posters that never autoplay (a muted autoplay wall on cellular is how you
	 * lose the visit before the offer loads). Only the arrangement differs.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Item = {
		src?: string;
		alt?: string;
		/** Present = playable. `src` is the poster until the visitor asks for it. */
		video?: string;
		caption?: string;
	};

	const p = $derived(
		(block.props ?? {}) as {
			items?: Item[];
			variant?: 'gallery' | 'carousel' | 'grid' | 'single';
			/**
			 * `auto` keeps the image's own ratio — for a size chart, an infographic
			 * or anything whose content IS the shape. Every other value crops to fit,
			 * which on a table silently cuts rows off the bottom.
			 */
			aspect?: 'auto' | 'square' | 'portrait' | 'landscape' | 'video';
			/** carousel: tile width as % of the rail, so the next one peeks. */
			peek?: number;
			columns?: 2 | 3;
			thumbnails?: boolean;
			arrows?: boolean;
			dots?: boolean;
			/** Play button fill. Campaign colour, same as the bars. */
			playColor?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const items = $derived(p.items?.length ? p.items : []);
	const variant = $derived(p.variant ?? 'gallery');

	let i = $state(0);
	/** Which tile has been asked to play. Only then does a <video> exist. */
	let playing = $state(-1);
	let rail = $state<HTMLElement | null>(null);

	const current = $derived(items[Math.min(i, items.length - 1)]);

	const ASPECT = {
		auto: '',
		square: 'aspect-square',
		portrait: 'aspect-[4/5]',
		landscape: 'aspect-[3/2]',
		video: 'aspect-video'
	};
	const COLS = { 2: 'grid-cols-2', 3: 'grid-cols-3' };
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };

	const aspectClass = $derived(ASPECT[p.aspect ?? 'square'] ?? ASPECT.square);
	const colsClass = $derived(COLS[p.columns ?? 2] ?? COLS[2]);
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const peek = $derived(p.peek ?? 72);

	/**
	 * Animate the rail by assigning scrollLeft per frame.
	 *
	 * Neither `scrollIntoView` nor `scrollTo({behavior:'smooth'})` is usable here:
	 * the first walks up the tree and scrolls ancestors, so a dot tap yanks the
	 * whole page; the second silently never lands on a snapping rail, leaving the
	 * carousel frozen while the dots march on — which is exactly the bug this
	 * replaced. Direct assignment always moves, so we drive the easing ourselves.
	 *
	 * Snapping is suspended for the duration, otherwise each frame's assignment
	 * gets re-snapped and the whole thing judders.
	 */
	function glide(el: HTMLElement, to: number) {
		const from = el.scrollLeft;
		const delta = to - from;
		if (!delta) return;

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			el.scrollLeft = to;
			return;
		}

		const prevSnap = el.style.scrollSnapType;
		el.style.scrollSnapType = 'none';
		const t0 = performance.now();
		const DUR = 320;
		let settled = false;

		const land = () => {
			if (settled) return;
			settled = true;
			el.scrollLeft = to;
			el.style.scrollSnapType = prevSnap;
		};

		const step = (now: number) => {
			if (settled) return;
			const k = Math.min(1, (now - t0) / DUR);
			el.scrollLeft = from + delta * (1 - Math.pow(1 - k, 3)); // easeOutCubic
			if (k < 1) requestAnimationFrame(step);
			else land();
		};
		requestAnimationFrame(step);

		// rAF is throttled to zero in a backgrounded or hidden tab, which would
		// otherwise strand the rail mid-scroll with snapping still disabled.
		// Guarantee the end state regardless of whether a frame ever runs.
		setTimeout(land, DUR + 80);
	}

	function go(n: number) {
		const next = (n + items.length) % items.length;
		i = next;
		ctx.track('media_view', { index: next });
		const el = rail;
		const t = el?.children[next] as HTMLElement | undefined;
		if (!el || !t) return;
		glide(el, t.offsetLeft - (el.clientWidth - t.offsetWidth) / 2);
	}

	/** Derive the active dot from scroll position — the rail is swipeable too. */
	function onScroll() {
		if (!rail) return;
		const mid = rail.scrollLeft + rail.clientWidth / 2;
		let best = 0,
			bestD = Infinity;
		[...rail.children].forEach((c, n) => {
			const el = c as HTMLElement;
			const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
			if (d < bestD) {
				bestD = d;
				best = n;
			}
		});
		i = best;
	}

	function play(n: number) {
		playing = n;
		ctx.track('media_play', { index: n });
	}

	const ARROW =
		'absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill bg-black/35 text-white backdrop-blur-sm transition-opacity hover:bg-black/55';
</script>

<style>
	/* Deliberately NOT scroll-behavior: smooth — see `glide()`. Any smooth path,
	   CSS or JS, can silently swallow the scroll on a snapping rail. */
	.rail {
		scroll-behavior: auto;
	}
</style>

{#snippet tile(it: Item, n: number)}
	<div class="relative {aspectClass} overflow-hidden rounded-panel bg-fx-surface">
		{#if it.video && playing === n}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				src={it.video}
				poster={it.src}
				class="size-full object-cover"
				controls
				autoplay
				playsinline
			></video>
		{:else}
			<img
				src={it.src}
				alt={it.alt ?? ''}
				class={aspectClass ? 'size-full object-cover' : 'block h-auto w-full'}
				loading="lazy"
			/>
			{#if it.video}
				<button
					type="button"
					onclick={() => play(n)}
					aria-label="Play video{it.alt ? `: ${it.alt}` : ''}"
					class="absolute inset-0 flex items-center justify-center"
				>
					<span
						class="flex size-10 items-center justify-center rounded-pill text-white"
						style:background={p.playColor ?? 'rgba(0,0,0,.45)'}
					>
						<svg viewBox="0 0 24 24" fill="currentColor" class="size-4" aria-hidden="true">
							<path d="M8 5v14l11-7z" />
						</svg>
					</span>
				</button>
			{/if}
		{/if}
	</div>
{/snippet}

{#snippet dots()}
	{#if p.dots !== false && items.length > 1}
		<div class="mt-4 flex justify-center gap-2">
			{#each items as _, n (n)}
				<button
					type="button"
					onclick={() => go(n)}
					aria-label="Item {n + 1} of {items.length}"
					aria-current={n === i}
					class="size-2 rounded-full transition-colors {n === i
						? 'bg-fx-ink'
						: 'bg-[#c9c6c0] hover:bg-fx-muted'}"
				></button>
			{/each}
		</div>
	{/if}
{/snippet}

{#if items.length}
	<section class="mx-auto w-full {widthClass}">
		{#if variant === 'carousel'}
			<div class="relative">
				<!-- A scroll rail, not a transform track: swipe is native, momentum is
				     native, and it degrades to a plain scroller without JS. -->
				<ul
					bind:this={rail}
					onscroll={onScroll}
					class="rail flex snap-x snap-mandatory gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{#each items as it, n (n)}
						<li class="shrink-0 snap-center" style:width="{peek}%">
							{@render tile(it, n)}
							{#if it.caption}
								<p class="text-13 text-fx-muted mt-2">{it.caption}</p>
							{/if}
						</li>
					{/each}
				</ul>

				{#if p.arrows !== false && items.length > 1}
					<button type="button" onclick={() => go(i - 1)} aria-label="Previous" class="{ARROW} left-2">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
					</button>
					<button type="button" onclick={() => go(i + 1)} aria-label="Next" class="{ARROW} right-2">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
					</button>
				{/if}
			</div>
			{@render dots()}
		{:else if variant === 'grid'}
			<div class="grid {colsClass} gap-2 px-gutter">
				{#each items as it, n (n)}
					<figure class="m-0">
						{@render tile(it, n)}
						{#if it.caption}
							<figcaption class="text-13 text-fx-muted mt-2">{it.caption}</figcaption>
						{/if}
					</figure>
				{/each}
			</div>
		{:else if variant === 'single'}
			<figure class="m-0 px-gutter">
				{@render tile(items[0], 0)}
				{#if items[0].caption}
					<figcaption class="text-13 text-fx-muted mt-2">{items[0].caption}</figcaption>
				{/if}
			</figure>
		{:else}
			<div class="relative">
				{@render tile(current, i)}

				{#if p.arrows !== false && items.length > 1}
					<button type="button" onclick={() => go(i - 1)} aria-label="Previous image" class="{ARROW} left-2">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
					</button>
					<button type="button" onclick={() => go(i + 1)} aria-label="Next image" class="{ARROW} right-2">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
					</button>
				{/if}
			</div>

			{#if p.thumbnails !== false && items.length > 1}
				<!-- Scrolls rather than shrinking: eight thumbnails squeezed into a phone
				     width are untappable, and a scroll strip is what a shopper expects. -->
				<ul class="mt-2 flex snap-x gap-2 overflow-x-auto px-gutter pb-1">
					{#each items as it, n (n)}
						<li class="shrink-0 snap-start">
							<button
								type="button"
								onclick={() => go(n)}
								aria-label="Image {n + 1} of {items.length}"
								aria-current={n === i}
								class="block size-16 overflow-hidden rounded-[4px] border-2 transition-colors {n === i
									? 'border-fx-ink'
									: 'border-transparent'}"
							>
								<img src={it.src} alt="" class="size-full object-cover" loading="lazy" />
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if current.caption}
				<p class="text-13 text-fx-muted mt-2 px-gutter">{current.caption}</p>
			{/if}
		{/if}
	</section>
{/if}
