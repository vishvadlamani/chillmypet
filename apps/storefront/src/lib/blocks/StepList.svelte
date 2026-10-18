<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from '@funnel/blocks-dr/tokens';

	/**
	 * `step_list` — "how it goes on", in numbered steps beside one photo.
	 *
	 * The question a costume page has to answer before the price is "will I be
	 * able to get it on my dog". Three short steps next to the close-up of the
	 * hood answer it in the time it takes to scroll past.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Step = { title: string; body?: string };

	const p = $derived(
		(block.props ?? {}) as {
			title?: string;
			/** `**bold**` is honoured. */
			lead?: string;
			image?: { src?: string; alt?: string };
			steps?: Step[];
			note?: string;
		}
	);
	const steps = $derived((p.steps ?? []).filter((s) => s.title));
</script>

{#if steps.length}
	<section class="steps" class:solo={!p.image?.src} aria-labelledby="{block.id}-title">
		{#if p.image?.src}
			<figure class="photo">
				<img src={p.image.src} alt={p.image.alt ?? ''} width="900" height="900" loading="lazy" />
			</figure>
		{/if}
		<div class="text">
			{#if p.title}<h2 id="{block.id}-title">{p.title}</h2>{/if}
			{#if p.lead}
				<p class="lead">
					{#each emphasize(p.lead) as span, i (i)}
						{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
					{/each}
				</p>
			{/if}
			<ol>
				{#each steps as step, i (step.title)}
					<li>
						<span class="n" aria-hidden="true">{i + 1}</span>
						<div>
							<h3>{step.title}</h3>
							{#if step.body}<p>{step.body}</p>{/if}
						</div>
					</li>
				{/each}
			</ol>
			{#if p.note}<p class="note">{p.note}</p>{/if}
		</div>
	</section>
{/if}

<style>
	.steps {
		width: 100%;
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 var(--spacing-gutter, 1.5rem);
		display: grid;
		gap: 20px;
		align-items: center;
		color: var(--brand-navy, #0b3c49);
	}
	@media (min-width: 768px) {
		.steps {
			grid-template-columns: 0.9fr 1.1fr;
			gap: 40px;
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
	h2 {
		margin: 0 0 8px;
		font-size: 28px;
		line-height: 1.2;
		font-weight: 700;
	}
	.lead {
		margin: 0 0 16px;
		font-size: 17px;
		line-height: 1.45;
	}
	ol {
		display: grid;
		gap: 14px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		gap: 14px;
		align-items: flex-start;
		background: #fff;
		border-radius: 18px;
		padding: 14px 16px;
		box-shadow: 0 6px 18px rgb(11 60 73 / 0.08);
	}
	.n {
		flex: 0 0 auto;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 18px;
		color: #fff;
		background: var(--xmas-pine, #1f5f3f);
	}
	li:nth-child(2) .n {
		background: var(--xmas-red, #b3202a);
	}
	li:nth-child(3) .n {
		background: var(--brand-orange, #ff6b2c);
		color: var(--brand-navy, #0b3c49);
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
	}
	.note {
		margin: 14px 0 0;
		font-size: 14px;
		color: #24525e;
	}
</style>
