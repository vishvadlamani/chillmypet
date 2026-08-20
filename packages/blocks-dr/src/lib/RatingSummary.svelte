<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { fill } from './tokens';

	/**
	 * `rating_summary` — average, total, and the star histogram.
	 *
	 * Kept separate from `reviews` because the two get placed apart: the summary
	 * belongs near the buy box where the decision happens, the cards further down
	 * where someone is already reading. One block would force them adjacent.
	 *
	 * Every number here is `$ref`-able — a hardcoded average is a claim about
	 * other customers, and it goes stale the moment a review lands.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Row = { stars?: number; count?: number };

	const p = $derived(
		(block.props ?? {}) as {
			average?: number;
			total?: number;
			/** One entry per star level. Missing levels render as zero rows. */
			histogram?: Row[];
			/**
			 * `panel` is the block with the big average and the histogram.
			 * `inline` is the one-line version that sits above a product title.
			 */
			variant?: 'panel' | 'inline';
			/** `inline` only. `{average}` and `{total}` are substituted. */
			caption?: string;
			align?: 'left' | 'center';
			showHistogram?: boolean;
			starColor?: string;
			barColor?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const centered = $derived(p.align !== 'left');
	const star = $derived(p.starColor ?? '#f5c518');
	const bar = $derived(p.barColor ?? '#767676');

	/** Normalise to 5→1 so a partial histogram still renders every level. */
	const rows = $derived.by(() => {
		const by = new Map((p.histogram ?? []).map((r) => [r.stars, r.count ?? 0]));
		return [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: by.get(s) ?? 0 }));
	});
	const maxCount = $derived(Math.max(1, ...rows.map((r) => r.count)));
	const totalCount = $derived(p.total ?? rows.reduce((s, r) => s + r.count, 0));
	const fmt = (n: number) => n.toLocaleString('en-US');

	const inline = $derived(p.variant === 'inline');
	/** Rounds up, so 4.2 shows five stars only at 4.75+. */
	const filled = $derived(Math.round(p.average ?? 0));
	const caption = $derived(
		fill(p.caption ?? '{average} from {total} reviews', {
			average: String(p.average ?? '—'),
			/** Grouped — "1,127 reviews" reads faster in a sentence. */
			total: fmt(totalCount),
			/** Ungrouped, for counts written as a claim: "1127+ Pet Parents". */
			totalRaw: String(totalCount)
		})
	);
</script>

{#snippet stars(n: number, size: string)}
	<span class="flex shrink-0 items-center gap-0.5">
		{#each [1, 2, 3, 4, 5] as s (s)}
			<svg
				class={size}
				viewBox="0 0 24 24"
				fill={s <= n ? star : 'none'}
				stroke={star}
				stroke-width={s <= n ? 0 : 1.5}
				aria-hidden="true"
			>
				<path
					d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
				/>
			</svg>
		{/each}
	</span>
{/snippet}

{#if inline}
	<!-- One line, no padding of its own: `inline` exists to sit in a buy column
	     that already owns the gutter, and a second one would step it inward from
	     the title it belongs to. -->
	<section class="mx-auto w-full {widthClass}">
		<div class="flex flex-wrap items-center gap-3 {centered ? 'justify-center' : ''}">
			{@render stars(filled, 'size-6')}
			<p class="text-17 text-fx-ink">{caption}</p>
		</div>
	</section>
{:else}
<section class="mx-auto w-full {widthClass} px-gutter">
	<!-- Stacks on a phone and only goes side-by-side when there's width for it.
	     The histogram needs a real bar length to mean anything; squeezed next to
	     the average on a 390pt screen it becomes decoration. -->
	<div
		class="flex flex-col gap-6 {centered ? 'items-center' : 'sm:flex-row sm:items-center sm:gap-8'}"
	>
		<div class="flex shrink-0 flex-col {centered ? 'items-center' : ''}">
			<div class="flex items-center gap-2">
				<svg class="size-8" viewBox="0 0 24 24" fill={star} aria-hidden="true">
					<path
						d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
					/>
				</svg>
				<span class="text-33 text-fx-ink font-semibold tabular-nums">{p.average ?? '—'}</span>
			</div>
			<p class="text-17 text-fx-ink mt-1">{fmt(totalCount)} Reviews</p>
		</div>

		{#if p.showHistogram !== false}
			<ul class="flex w-full min-w-0 flex-col gap-2">
				{#each rows as r (r.stars)}
					<li class="flex items-center gap-3">
						{@render stars(r.stars, 'size-4')}
						<span
							class="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-[#ececec]"
							role="img"
							aria-label="{r.stars} star: {fmt(r.count)} reviews"
						>
							<span
								class="block h-full rounded-pill"
								style:width="{(r.count / maxCount) * 100}%"
								style:background={bar}
							></span>
						</span>
						<span class="text-13 text-fx-sub w-14 shrink-0 text-right tabular-nums"
							>({fmt(r.count)})</span
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
{/if}
