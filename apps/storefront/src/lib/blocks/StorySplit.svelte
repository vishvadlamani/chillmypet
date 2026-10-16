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
	.story {
		width: 100%;
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 var(--spacing-gutter, 1.5rem);
		display: grid;
		gap: 24px;
		align-items: center;
		color: var(--brand-navy, #0b3c49);
	}
	@media (min-width: 768px) {
		.story {
			grid-template-columns: 1fr 1fr;
			gap: 56px;
		}
		/* Beside a block with its photo on the left, the page zig-zags. */
		.story.flip .photo {
			order: 1;
		}
	}
	.photo {
		margin: 0;
		border-radius: 24px;
		overflow: hidden;
		box-shadow: 0 12px 32px rgb(11 60 73 / 0.16);
		background: #fff;
	}
	.photo img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.eyebrow {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--xmas-red, #b3202a);
	}
	h2 {
		margin: 0 0 14px;
		font-size: clamp(30px, 4.4vw, 42px);
		line-height: 1.08;
		font-weight: 700;
	}
	h2 :global(strong) {
		color: var(--xmas-pine, #1f5f3f);
	}
	.para {
		margin: 0 0 12px;
		font-size: 17px;
		line-height: 1.5;
		max-width: 46ch;
	}
	ol {
		margin: 20px 0 0;
		padding: 0;
		list-style: none;
		border-top: 1px solid rgb(11 60 73 / 0.14);
	}
	li {
		display: flex;
		gap: 16px;
		align-items: baseline;
		padding: 14px 0;
		border-bottom: 1px solid rgb(11 60 73 / 0.14);
	}
	.n {
		flex: 0 0 auto;
		min-width: 2ch;
		font-size: 20px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--xmas-red, #b3202a);
	}
	h3 {
		margin: 0 0 2px;
		font-size: 18px;
		line-height: 1.25;
		font-weight: 700;
	}
	li p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		color: #24525e;
	}
</style>
