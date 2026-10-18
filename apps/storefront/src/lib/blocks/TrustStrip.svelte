<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { LINE_ICONS } from '$lib/line-icons';

	/**
	 * `trust_strip` — a pine band of short promises between the buy box and
	 * the story, the way shops break a long product page into chapters. Only
	 * promises the policy pages already make: no counts, ratings or "best".
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Item = { icon?: string; text: string };
	const items = $derived(((block.props ?? {}) as { items?: Item[] }).items?.filter((i) => i.text) ?? []);
</script>

{#if items.length}
	<section class="trust-strip" aria-label="What every order gets">
		<ul>
			{#each items as item (item.text)}
				<li>
					{#if item.icon && LINE_ICONS[item.icon]}
						<svg viewBox="0 0 24 24" aria-hidden="true">{@html LINE_ICONS[item.icon]}</svg>
					{/if}
					<span>{item.text}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.trust-strip {
		width: 100%;
		margin: 8px 0;
		background: var(--tree-green, #285b43);
		color: #fdfbf7;
	}
	ul {
		max-width: 1176px;
		margin: 0 auto;
		padding: 14px 16px;
		list-style: none;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px 16px;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.8px;
		text-transform: uppercase;
		line-height: 1.3;
	}
	svg {
		flex: 0 0 auto;
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.5;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	@media (min-width: 768px) {
		ul {
			grid-template-columns: repeat(4, auto);
			justify-content: space-between;
			padding: 16px 40px;
		}
	}
</style>
