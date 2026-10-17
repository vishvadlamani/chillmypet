<script lang="ts">
	import type { Snippet } from 'svelte';
	import ProductGrid from '$lib/components/ProductGrid.svelte';
	import type { ProductCard } from '$lib/store/collection';

	/**
	 * A shop page in the tree storefront's look: a short intro, the cards, and
	 * the promises the product pages make. Short on purpose: an ad can open any
	 * of these on a phone, and the products' photos and prices have to be on
	 * the first screen.
	 */
	let {
		eyebrow,
		title,
		lead,
		level = 'h1',
		products,
		empty,
		children
	}: {
		eyebrow: string;
		title: string;
		lead: string;
		/** `h2` when the page has its own h1 above (the home page's hero). */
		level?: 'h1' | 'h2';
		products: ProductCard[];
		empty: string;
		/** Anything under the cards, before the promises. */
		children?: Snippet;
	} = $props();
</script>

<div class="tree-theme collection">
	<header class="intro">
		<p class="eyebrow">{eyebrow}</p>
		<svelte:element this={level} class="title">{title}</svelte:element>
		<p class="lead">{lead}</p>
	</header>

	{#if products.length}
		<ProductGrid {products} />
	{:else}
		<p class="empty">{empty}</p>
	{/if}

	{@render children?.()}

	<ul class="promises">
		<li><strong>Free shipping</strong> to the US, with tracking</li>
		<li><strong>30 days</strong> to return or swap a size</li>
		<li><strong>A real inbox:</strong> <a href="/contact">contact us</a></li>
	</ul>
</div>

<style>
	.collection {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px 16px 48px;
		color: var(--tree-ink);
	}
	.intro {
		text-align: center;
		margin: 0 auto 18px;
		max-width: 620px;
	}
	.eyebrow {
		margin: 0 0 4px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 1.5px;
		text-transform: uppercase;
		color: var(--tree-red);
	}
	.intro .title {
		margin: 0;
		color: var(--tree-ink);
		font-size: 26px;
		line-height: 1.2;
		font-weight: 700;
		letter-spacing: 0.4px;
	}
	.lead {
		margin: 6px 0 0;
		font-size: 14px;
		color: var(--tree-muted);
	}
	@media (min-width: 640px) {
		.collection {
			padding-top: 40px;
		}
		.intro .title {
			font-size: 36px;
		}
		.lead {
			font-size: 16px;
		}
		.intro {
			margin-bottom: 32px;
		}
	}
	.empty {
		text-align: center;
		color: var(--tree-muted);
		padding: 40px 0;
	}
	.promises {
		list-style: none;
		margin: 28px 0 0;
		padding: 18px 0 0;
		border-top: 1px solid var(--tree-rule);
		display: grid;
		gap: 8px;
		font-size: 14px;
		color: var(--tree-muted);
		text-align: center;
	}
	.promises strong {
		color: var(--tree-ink);
	}
	.promises a {
		color: var(--tree-green);
		text-decoration: underline;
	}
	@media (min-width: 640px) {
		.promises {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
