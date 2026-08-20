<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from './tokens';

	/**
	 * `guarantee` — the risk-reversal panel: a seal, a claim, and the terms.
	 *
	 * Its own block rather than copy inside another, because it moves. It sits
	 * under the buy box on some pages, after the reviews on others, and inside a
	 * checkout on a third — and it's the one section people re-read before paying.
	 *
	 * The promise is `$ref` material. "30-Day Guarantee" written as a literal here
	 * is a returns policy stored in a manifest, which is the wrong place for a
	 * commitment support has to honour.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			image?: string;
			alt?: string;
			/** Small line above the body — "500+ dogs already have theirs". */
			eyebrow?: string;
			heading?: string;
			/** `**bold**` is honoured. */
			body?: string;
			align?: 'left' | 'center';
			/** Seal width in px. Defaults to something that reads as a badge. */
			sealSize?: number;
			width?: 'shell' | 'page' | 'article' | 'measure' | 'full';
		}
	);

	const WIDTHS = {
		shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		measure: 'max-w-measure',
		full: 'max-w-none'
	};
	const widthClass = $derived(WIDTHS[p.width ?? 'article'] ?? WIDTHS.article);
	const centered = $derived((p.align ?? 'center') === 'center');
	const spans = $derived(emphasize(p.body ?? ''));
</script>

{#if p.image || p.body}
	<section class="mx-auto w-full {widthClass} px-gutter">
		<div
			class="rounded-card flex flex-col gap-4 border border-[#e2e0dc] bg-white px-6 py-8 {centered
				? 'items-center text-center'
				: 'items-start text-left'}"
		>
			{#if p.image}
				<!-- Decorative: the seal repeats the words underneath it, and a screen
				     reader announcing "money back 30 days guarantee" before reading the
				     same sentence is noise. -->
				<img
					src={p.image}
					alt={p.alt ?? ''}
					width={p.sealSize ?? 132}
					class="h-auto shrink-0"
					style:width="{p.sealSize ?? 132}px"
					loading="lazy"
					aria-hidden={p.alt ? undefined : 'true'}
				/>
			{/if}

			{#if p.eyebrow}
				<p class="text-13 tracking-label text-fx-sub font-bold uppercase">{p.eyebrow}</p>
			{/if}

			{#if p.heading}
				<h2 class="text-21 tracking-headline text-fx-ink font-bold text-balance">{p.heading}</h2>
			{/if}

			{#if p.body}
				<p class="text-15 text-fx-sub max-w-measure">
					{#each spans as s, i (i)}{#if s.strong}<strong class="text-fx-ink font-bold"
								>{s.text}</strong
							>{:else}{s.text}{/if}{/each}
				</p>
			{/if}
		</div>
	</section>
{/if}
