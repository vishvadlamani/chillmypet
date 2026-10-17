<script lang="ts">
	import { page } from '$app/state';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';

	/**
	 * − 2 + for one cart line, on the checkouts' order summaries.
	 *
	 * The cart lives in the browser for good, so a basket can still hold what
	 * was added on an earlier visit (a life jacket under a Christmas hoodie).
	 * Before this, the only way to change it at checkout was a small "Remove"
	 * at the bottom of the page, and no way at all to buy two. It writes the
	 * cart and nothing else: the checkout re-prices every change through
	 * `/api/cart`, and the order action prices it again, so the figure shown
	 * is always the server's.
	 *
	 * The minus stops at 1; taking a line out is Remove's job, next to it, so
	 * a tap too many never empties a line by accident. The plus stops at the
	 * cart's own per-line cap, which is the order action's cap too.
	 */
	let { variantId, quantity, title }: { variantId: number; quantity: number; title: string } =
		$props();

	const MAX = 10;
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));
</script>

<span class="stepper" role="group" aria-label={t('cart.quantityOf', { item: title })}>
	<button
		type="button"
		disabled={quantity <= 1}
		aria-label={t('cart.decrease', { item: title })}
		onclick={() => cart.setQuantity(variantId, quantity - 1)}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg>
	</button>
	<output aria-live="polite">{quantity}</output>
	<button
		type="button"
		disabled={quantity >= MAX}
		aria-label={t('cart.increase', { item: title })}
		onclick={() => cart.setQuantity(variantId, quantity + 1)}
	>
		<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg>
	</button>
</span>

<style>
	.stepper {
		display: inline-flex;
		align-items: center;
		border: 1px solid #d6d1c7;
		border-radius: 10px;
		background: #fff;
	}
	/* 44px squares: the people these pages are for tap with a thumb, on a
	   phone, often in a moving car or on a sofa. */
	button {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		background: none;
		color: inherit;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	button:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: -4px;
		border-radius: 10px;
	}
	svg {
		width: 16px;
		height: 16px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	output {
		min-width: 28px;
		font-size: 17px;
		font-weight: 600;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
</style>
