<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `press_feature` — "as seen on" clip with its headline and caption.
	 *
	 * Autoplays muted by default, unlike `media`. A press clip is the proof, not
	 * an optional extra, and a short muted loop reads as a broadcast still that
	 * happens to move. Set `autoplay: false` where the file is large enough to
	 * matter on cellular.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			headline?: string;
			src?: string;
			poster?: string;
			caption?: string;
			autoplay?: boolean;
			/** Hairline under the block — it usually separates two proof beats. */
			rule?: boolean;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	{#if p.headline}
		<h2 class="text-21 tracking-headline text-fx-ink font-serif">{p.headline}</h2>
	{/if}

	{#if p.src}
		<!-- aspect-video reserves the space so the caption doesn't jump on load.
		     muted + playsinline is what lets it autoplay inline on iOS at all. -->
		<video
			class="rounded-panel bg-fx-surface mt-6 aspect-video w-full object-cover"
			src={p.src}
			poster={p.poster}
			autoplay={p.autoplay !== false}
			muted
			loop
			playsinline
			aria-label={p.caption}
		></video>
	{/if}

	{#if p.caption}
		<p class="text-15 text-fx-sub mt-3">{p.caption}</p>
	{/if}

	{#if p.rule !== false}
		<div class="mt-6 h-px bg-[#e2e0dc]"></div>
	{/if}
</section>
