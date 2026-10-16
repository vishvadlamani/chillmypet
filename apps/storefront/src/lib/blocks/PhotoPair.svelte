<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `photo_pair` — a centred heading over two captioned photos.
	 *
	 * The "here is what it looks like on" moment, after the story and before
	 * the fit: big photos, one bold line under each, a line of small print.
	 * Every photo must be of the product being sold; captions describe what is
	 * in the frame, never a customer who is not.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Photo = { src: string; alt?: string; caption?: string };

	const p = $derived(
		(block.props ?? {}) as {
			eyebrow?: string;
			title?: string;
			sub?: string;
			photos?: Photo[];
			note?: string;
		}
	);
	const photos = $derived((p.photos ?? []).filter((ph) => ph.src));
</script>

{#if photos.length}
	<section class="pair" aria-labelledby={p.title ? `${block.id}-title` : undefined}>
		{#if p.eyebrow}<p class="eyebrow">{p.eyebrow}</p>{/if}
		{#if p.title}<h2 id="{block.id}-title">{p.title}</h2>{/if}
		{#if p.sub}<p class="sub">{p.sub}</p>{/if}
		<div class="grid">
			{#each photos as ph (ph.src)}
				<figure>
					<img src={ph.src} alt={ph.alt ?? ''} width="900" height="900" loading="lazy" />
					{#if ph.caption}<figcaption>{ph.caption}</figcaption>{/if}
				</figure>
			{/each}
		</div>
		{#if p.note}<p class="note">{p.note}</p>{/if}
	</section>
{/if}

<style>
	.pair {
		width: 100%;
		max-width: 1320px;
		margin: 0 auto;
		padding: 28px var(--spacing-gutter, 18px);
		text-align: center;
		color: var(--tree-ink, #243b31);
	}
	@media (min-width: 768px) {
		.pair {
			padding-top: 48px;
			padding-bottom: 48px;
		}
	}
	.eyebrow {
		margin: 0 0 14px;
		font-size: 11px;
		line-height: 17.6px;
		font-weight: 700;
		letter-spacing: 1.8px;
		text-transform: uppercase;
	}
	h2 {
		margin: 0;
		font-size: 27px;
		line-height: 33.75px;
		font-weight: 700;
		letter-spacing: -0.5px;
		color: var(--tree-green, #285b43);
	}
	@media (min-width: 768px) {
		h2 {
			font-size: 36px;
			line-height: 45px;
		}
	}
	.sub {
		max-width: 60ch;
		margin: 4px auto 0;
		font-size: 15px;
		line-height: 24px;
	}
	.grid {
		display: grid;
		gap: 24px;
		margin-top: 28px;
	}
	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	figure {
		margin: 0;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 12px;
		background: #f4f0e7;
	}
	figcaption {
		margin-top: 12px;
		font-size: 15px;
		line-height: 24px;
		font-weight: 700;
	}
	.note {
		margin: 16px 0 0;
		font-size: 11px;
		line-height: 16.5px;
		color: var(--tree-muted, #637168);
	}
</style>
