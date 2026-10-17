<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from '@funnel/blocks-dr/tokens';

	/**
	 * `story` — the paragraph a product page owes the buyer after the buy box.
	 *
	 * One photo beside an eyebrow, a headline, a short read and a numbered list
	 * of what the thing actually is. It sells the moment rather than the specs;
	 * the specs are the size guide's and the FAQ's job. No price, no date, no
	 * button: the picker owns those, and a second place quoting them is a
	 * second place to get them wrong.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Point = { title: string; body?: string };

	const p = $derived(
		(block.props ?? {}) as {
			eyebrow?: string;
			/** `**bold**` is honoured. */
			title?: string;
			/** Paragraphs. `**bold**` is honoured. */
			body?: string[];
			points?: Point[];
			image?: { src?: string; alt?: string };
			/** Which side the photo sits on from tablet width up. Phones always open on it. */
			imageSide?: 'left' | 'right';
		}
	);
	const points = $derived((p.points ?? []).filter((pt) => pt.title));
</script>

{#snippet rich(text: string)}
	{#each emphasize(text) as span, i (i)}
		{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
	{/each}
{/snippet}

{#if p.title}
	<section class="story" class:flip={p.imageSide === 'right'} aria-labelledby="{block.id}-title">
		{#if p.image?.src}
			<figure class="photo">
				<img src={p.image.src} alt={p.image.alt ?? ''} width="900" height="900" loading="lazy" />
			</figure>
		{/if}
		<div class="text">
			{#if p.eyebrow}<p class="eyebrow">{p.eyebrow}</p>{/if}
			<h2 id="{block.id}-title">{@render rich(p.title)}</h2>
			{#each p.body ?? [] as para, i (i)}
				<p class="para">{@render rich(para)}</p>
			{/each}
			{#if points.length}
				<ol>
					{#each points as point, i (point.title)}
						<li>
							<span class="n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
							<div>
								<h3>{point.title}</h3>
								{#if point.body}<p>{point.body}</p>{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</section>
{/if}

<style>
	/* The editorial look of the tree storefront: a softly rounded photo, a
	   small tracked eyebrow, a pine headline, Georgia numerals on hairlines. */
	.story {
		width: 100%;
		max-width: 1320px;
		margin: 0 auto;
		padding: 28px var(--spacing-gutter, 18px);
		display: grid;
		gap: 24px;
		align-items: center;
		color: var(--tree-ink, #243b31);
	}
	@media (min-width: 768px) {
		.story {
			grid-template-columns: 1fr 1fr;
			gap: 82px;
			padding-top: 48px;
			padding-bottom: 48px;
		}
		/* Beside a block with its photo on the left, the page zig-zags. */
		.story.flip .photo {
			order: 1;
		}
	}
	.photo {
		margin: 0;
		border-radius: 12px;
		overflow: hidden;
		background: #f4f0e7;
	}
	.photo img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.eyebrow {
		margin: 0 0 16px;
		font-size: 11px;
		line-height: 17.6px;
		font-weight: 700;
		letter-spacing: 1.8px;
		text-transform: uppercase;
	}
	h2 {
		margin: 0 0 18px;
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
	h2 :global(strong) {
		font-weight: 700;
	}
	.para {
		margin: 0 0 20px;
		font-size: 15px;
		line-height: 24px;
	}
	ol {
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid var(--tree-rule, rgb(36 59 49 / 0.14));
	}
	li {
		position: relative;
		padding: 16px 0 16px 38px;
		border-bottom: 1px solid var(--tree-rule, rgb(36 59 49 / 0.14));
	}
	.n {
		position: absolute;
		left: 0;
		top: 15px;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 20px;
		color: var(--tree-red, #a24442);
	}
	h3 {
		margin: 0 0 4px;
		font-size: 14px;
		line-height: 22.4px;
		font-weight: 700;
		letter-spacing: 0.9px;
		color: var(--tree-ink, #243b31);
	}
	li p {
		margin: 0;
		font-size: 12px;
		line-height: 19.2px;
		color: var(--tree-muted, #637168);
	}
</style>
