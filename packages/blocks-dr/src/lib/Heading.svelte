<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize, fill, monthName } from './tokens';

	/**
	 * `heading` — a section title.
	 *
	 * Deliberately generic rather than a `product_title`: the same block sets a
	 * product name, an advertorial headline and a section break, and a library
	 * with one block per place a heading appears is a library nobody can hold in
	 * their head.
	 *
	 * `level` and `size` are separate props on purpose. A page needs exactly one
	 * `h1` and the rest below it, but the biggest type on the page is often not
	 * that `h1` — tying the two together forces a choice between correct outlines
	 * and correct typography.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** `{month}` is substituted; `**bold**` is honoured. */
			text?: string;
			eyebrow?: string;
			/** Heading level for the document outline. Default 2 — one h1 per page. */
			level?: 1 | 2 | 3;
			size?: 'sm' | 'md' | 'lg' | 'xl';
			align?: 'left' | 'center';
			weight?: 'bold' | 'black';
			/**
			 * Default is `normal`, not the negative tracking usually reached for at
			 * display sizes. Tightening is a Helvetica/Inter habit; the geometric
			 * sans a DR storefront tends to run (Poppins here) is drawn with round
			 * counters that close up when squeezed. Measured storefronts set slightly
			 * POSITIVE tracking on the product title.
			 */
			tracking?: 'tight' | 'normal' | 'wide';
			locale?: string;
			width?: 'shell' | 'page' | 'article' | 'measure' | 'full';
		}
	);

	// Fixed scale, so the step down for phones is explicit. A 56px product title
	// on a 390pt screen is four words a line.
	const SIZES = {
		sm: 'text-21 md:text-23',
		md: 'text-23 md:text-33',
		lg: 'text-33 md:text-40',
		xl: 'text-33 md:text-56'
	};
	const WIDTHS = { shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		measure: 'max-w-measure',
		full: 'max-w-none'
	};

	const TRACKING = { tight: 'tracking-display', normal: 'tracking-normal', wide: 'tracking-label' };
	const trackClass = $derived(TRACKING[p.tracking ?? 'normal'] ?? TRACKING.normal);
	const sizeClass = $derived(SIZES[p.size ?? 'lg'] ?? SIZES.lg);
	const widthClass = $derived(WIDTHS[p.width ?? 'full'] ?? WIDTHS.full);
	const weightClass = $derived(p.weight === 'black' ? 'font-black' : 'font-bold');
	const alignClass = $derived(p.align === 'center' ? 'text-center' : 'text-left');
	const spans = $derived(emphasize(fill(p.text ?? '', { month: monthName(p.locale) })));
	const level = $derived(p.level ?? 2);
</script>

{#if p.text}
	<!-- px-gutter, like every other block. Without it a `full`-width heading sets
	     its text hard against the window edge while the section under it sits on
	     the gutter, and the two read as belonging to different pages. -->
	<section class="mx-auto flex w-full {widthClass} flex-col gap-2 px-gutter {alignClass}">
		{#if p.eyebrow}
			<p class="text-13 tracking-eyebrow text-fx-sub font-semibold uppercase">{p.eyebrow}</p>
		{/if}

		<!-- Switched rather than rendered through a dynamic tag: `<svelte:element>`
		     takes a runtime string, and a manifest typo would then emit a real
		     element named whatever it said. -->
		{#snippet body()}
			{#each spans as s, i (i)}{#if s.strong}<strong class="font-black">{s.text}</strong
					>{:else}{s.text}{/if}{/each}
		{/snippet}

		{#if level === 1}
			<h1 class="{sizeClass} {weightClass} {trackClass} text-fx-ink text-balance">
				{@render body()}
			</h1>
		{:else if level === 3}
			<h3 class="{sizeClass} {weightClass} {trackClass} text-fx-ink text-balance">
				{@render body()}
			</h3>
		{:else}
			<h2 class="{sizeClass} {weightClass} {trackClass} text-fx-ink text-balance">
				{@render body()}
			</h2>
		{/if}
	</section>
{/if}
