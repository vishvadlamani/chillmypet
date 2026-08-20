<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `reviews` — the card wall. Photos, videos and text-only, mixed.
	 *
	 * Masonry via CSS columns rather than a JS layout pass: it reflows on resize
	 * for free, needs no measurement, and degrades to a single column with the
	 * stylesheet alone. On a phone that single column IS the right answer, so the
	 * mobile case costs nothing.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Item = {
		name?: string;
		verified?: boolean;
		rating?: number;
		body?: string;
		src?: string;
		alt?: string;
		/** Present = playable; `src` is the poster until asked for. */
		video?: string;
	};

	const p = $derived(
		(block.props ?? {}) as {
			items?: Item[];
			layout?: 'masonry' | 'carousel';
			/** Desktop column count. Mobile is always one — a review has to be readable. */
			columns?: 2 | 3 | 4;
			/** `auto` keeps each image's own shape, which is what staggers a wall. */
			mediaAspect?: 'auto' | 'square' | 'portrait';
			starColor?: string;
			playColor?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const items = $derived(p.items ?? []);
	const layout = $derived(p.layout ?? 'masonry');
	let playing = $state(-1);

	/**
	 * Two columns from 480px up, not from 640.
	 *
	 * One column means one review fills the screen, and the wall stops reading as
	 * a body of proof — it becomes a slideshow you scroll past. Competitor walls
	 * go to two the moment there's room, and "room" starts well below a tablet.
	 *
	 * Still one column on an actual phone: at 390pt, two columns leaves ~165px a
	 * card, which is about twenty characters a line.
	 */
	const COLS = {
		2: 'columns-1 min-[480px]:columns-2',
		3: 'columns-1 min-[480px]:columns-2 lg:columns-3',
		4: 'columns-1 min-[480px]:columns-2 md:columns-3 lg:columns-4'
	};
	const ASPECT = { auto: '', square: 'aspect-square', portrait: 'aspect-[4/5]' };
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };

	const colsClass = $derived(COLS[p.columns ?? 2] ?? COLS[2]);
	const aspectClass = $derived(ASPECT[p.mediaAspect ?? 'auto'] ?? '');
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const star = $derived(p.starColor ?? '#f5c518');

	function play(n: number) {
		playing = n;
		ctx.track('review_play', { index: n });
	}
</script>

{#snippet card(it: Item, n: number)}
	<article
		class="rounded-card overflow-hidden border border-[#e2e0dc] bg-white {layout === 'masonry'
			? 'mb-4 break-inside-avoid'
			: ''}"
	>
		{#if it.src}
			<div class="relative {aspectClass} bg-fx-surface">
				{#if it.video && playing === n}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video src={it.video} poster={it.src} class="block w-full" controls autoplay playsinline
					></video>
				{:else}
					<img
						src={it.src}
						alt={it.alt ?? ''}
						class="block w-full {aspectClass ? 'size-full object-cover' : 'h-auto'}"
						loading="lazy"
					/>
					{#if it.video}
						<button
							type="button"
							onclick={() => play(n)}
							aria-label="Play review video{it.name ? ` from ${it.name}` : ''}"
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
		{/if}

		{#if it.name || it.rating || it.body}
			<div class="flex flex-col gap-2 p-4">
				{#if it.name || it.verified}
					<div class="flex flex-wrap items-center gap-2">
						{#if it.name}<span class="text-15 text-fx-ink font-semibold">{it.name}</span>{/if}
						{#if it.verified}
							<span class="text-13 text-fx-sub inline-flex items-center gap-1">
								<svg class="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
									<circle cx="12" cy="12" r="10" fill="currentColor" />
									<path
										d="m8 12.5 2.5 2.5L16 9.5"
										fill="none"
										stroke="#fff"
										stroke-width="2.2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								Verified
							</span>
						{/if}
					</div>
				{/if}

				{#if it.rating}
					<span class="flex items-center gap-0.5" aria-label="{it.rating} out of 5">
						{#each [1, 2, 3, 4, 5] as s (s)}
							<svg
								class="size-4"
								viewBox="0 0 24 24"
								fill={s <= (it.rating ?? 0) ? star : '#e2e0dc'}
								aria-hidden="true"
							>
								<path
									d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
								/>
							</svg>
						{/each}
					</span>
				{/if}

				{#if it.body}<p class="text-15 text-fx-ink">{it.body}</p>{/if}
			</div>
		{/if}
	</article>
{/snippet}

{#if items.length}
	<section class="mx-auto w-full {widthClass}">
		{#if layout === 'carousel'}
			<ul
				class="flex snap-x snap-mandatory gap-4 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{#each items as it, n (n)}
					<li class="w-[82%] shrink-0 snap-center sm:w-[46%]">{@render card(it, n)}</li>
				{/each}
			</ul>
		{:else}
			<div class="{colsClass} gap-4 px-gutter">
				{#each items as it, n (n)}
					{@render card(it, n)}
				{/each}
			</div>
		{/if}
	</section>
{/if}
