<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { PAYMENT_ICONS, type PaymentMethod } from '$lib/store/payment-icons';

	/**
	 * The storefront's `payment_badges` renderer, registered over the library
	 * block of the same name in `$lib/store/blocks.ts`.
	 *
	 * The library block draws its marks with styled text so it stays portable,
	 * and that is right for a library. This store can ship the real artwork, so it
	 * does, because a lookalike logo near the price makes shoppers trust the page
	 * less. Same props as the library block, so the manifest doesn't change shape.
	 * `variant` is accepted and ignored: the card artwork brings its own tile.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			methods?: string[];
			variant?: 'tiles' | 'bare';
			size?: 'sm' | 'md' | 'lg';
			label?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	// A key with no artwork is dropped rather than drawn as an empty tile.
	const methods = $derived(
		(p.methods?.length ? p.methods : Object.keys(PAYMENT_ICONS)).filter(
			(m): m is PaymentMethod => m in PAYMENT_ICONS
		)
	);

	/** Fixed 38:24, the card's own ratio. Badges never stretch to fill the row. */
	const SIZE = {
		sm: 'h-5 w-[32px]',
		md: 'h-6 w-[38px]',
		lg: 'h-[30px] w-[48px]'
	};
	const sizeClass = $derived(SIZE[p.size ?? 'md'] ?? SIZE.md);
</script>

<section class="mx-auto flex w-full {widthClass} flex-col items-center gap-4 px-gutter">
	{#if p.label}
		<p class="text-11 tracking-label text-fx-muted uppercase">{p.label}</p>
	{/if}

	<ul class="flex w-full flex-wrap items-center justify-center gap-2" aria-label="Accepted payment methods">
		{#each methods as m (m)}
			<li class="pay-icon block shrink-0 {sizeClass}" role="img" aria-label={PAYMENT_ICONS[m].label}>
				{@html PAYMENT_ICONS[m].svg}
			</li>
		{/each}
	</ul>
</section>

<style>
	.pay-icon :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
