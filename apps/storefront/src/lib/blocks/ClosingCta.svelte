<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `closing_cta` — the last band on a long page: a line, and a way back up.
	 *
	 * `href` is an in-page anchor (the picker), never a route: where a visitor
	 * goes next is the host's call, and this only scrolls them up the same
	 * page. No price and no date, so it can never contradict the picker or the
	 * delivery strip.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as { eyebrow?: string; title?: string; cta?: string; href?: string }
	);

	function tapped() {
		ctx.track('closing_cta_click', { href: p.href });
	}
</script>

{#if p.title}
	<section class="closing" aria-labelledby="{block.id}-title">
		{#if p.eyebrow}<p class="eyebrow">{p.eyebrow}</p>{/if}
		<h2 id="{block.id}-title">{p.title}</h2>
		{#if p.cta && p.href?.startsWith('#')}
			<a class="cta" href={p.href} onclick={tapped}>{p.cta}</a>
		{/if}
	</section>
{/if}

<style>
	/* Full-bleed: the band is window-wide whatever the row around it. */
	.closing {
		width: 100vw;
		margin-left: calc(50% - 50vw);
		padding: 60px 20px;
		background: var(--tree-sage-cta, #e4e9d9);
		text-align: center;
		color: var(--tree-ink, #243b31);
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
		max-width: 22ch;
		margin: 0 auto;
		font-size: 27px;
		line-height: 33.75px;
		font-weight: 700;
		letter-spacing: -0.5px;
		color: var(--tree-green, #285b43);
	}
	@media (min-width: 768px) {
		h2 {
			max-width: none;
			font-size: 36px;
			line-height: 45px;
		}
	}
	.cta {
		display: inline-block;
		margin-top: 28px;
		border-radius: 28px;
		background: var(--tree-green, #285b43);
		color: #fff;
		padding: 17px 24px;
		font-size: 16px;
		line-height: 19.2px;
		font-weight: 800;
		letter-spacing: 0.4px;
		text-decoration: none;
	}
	.cta:hover {
		background: var(--tree-green-deep, #194b36);
	}
</style>
