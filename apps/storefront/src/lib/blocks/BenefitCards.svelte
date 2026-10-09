<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/** A heading and a grid of short, single-claim cards. */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Card = { icon?: string; title: string; body?: string };

	const p = $derived((block.props ?? {}) as { title?: string; items?: Card[] });
</script>

{#if p.items?.length}
	<section class="benefits" aria-labelledby="{block.id}-title">
		{#if p.title}<h2 id="{block.id}-title">{p.title}</h2>{/if}
		<ul>
			{#each p.items as card (card.title)}
				<li>
					{#if card.icon}<span class="icon" aria-hidden="true">{card.icon}</span>{/if}
					<h3>{card.title}</h3>
					{#if card.body}<p>{card.body}</p>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.benefits {
		width: 100%;
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 var(--spacing-gutter, 1.5rem);
		color: var(--brand-navy, #0b3c49);
	}
	h2 {
		font-size: 28px;
		line-height: 1.2;
		font-weight: 700;
		margin: 0 0 16px;
	}
	ul {
		display: grid;
		gap: 12px;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		background: #fff;
		border-radius: 20px;
		padding: 18px;
		border-top: 6px solid var(--xmas-pine, #1f5f3f);
		box-shadow: 0 6px 18px rgb(11 60 73 / 0.08);
	}
	li:nth-child(even) {
		border-top-color: var(--xmas-red, #b3202a);
	}
	.icon {
		font-size: 28px;
		line-height: 1;
	}
	h3 {
		font-size: 19px;
		line-height: 1.25;
		font-weight: 700;
		margin: 8px 0 4px;
	}
	p {
		margin: 0;
		font-size: 16px;
		line-height: 1.45;
	}
</style>
