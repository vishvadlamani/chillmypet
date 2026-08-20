<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `payment_badges` — accepted-payment row.
	 *
	 * Marks are inline SVG and styled text, never image files: a portable block
	 * can't assume a host's asset pipeline, and a broken logo at checkout costs
	 * more than the bytes saved. Networks get a brand-filled tile, wallets an
	 * outlined one — that contrast is what makes the row read as a row.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Method = 'visa' | 'mastercard' | 'amex' | 'discover' | 'paypal' | 'applepay' | 'googlepay';

	const p = $derived(
		(block.props ?? {}) as {
			methods?: Method[];
			/** `tiles` matches the boxed treatment; `bare` drops the tile chrome. */
			variant?: 'tiles' | 'bare';
			size?: 'sm' | 'md' | 'lg';
			label?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	// Blocks own their own column. The layout can't decide it for them — the
	// countdown alone needs full-bleed as a banner and none at all inline.
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	const methods = $derived(
		p.methods?.length
			? p.methods
			: (['visa', 'mastercard', 'amex', 'paypal', 'applepay', 'googlepay'] as Method[])
	);

	/**
	 * The row never wraps. Tiles are `flex-1` off a small floor rather than a fixed
	 * width, so they divide whatever space there is — six across 390pt gives ~52px
	 * each, and it still holds at 320pt. Sizing them to *happen* to fit is fragile:
	 * one wide mark (PayPal's wordmark) tips it, and 3+3 reads as two rows of logos
	 * instead of one accepted-payment strip.
	 */
	const TILE = {
		sm: 'h-6 min-w-[28px] px-1 rounded-[4px]',
		md: 'h-7 min-w-[36px] px-2 rounded-[4px]',
		lg: 'h-8 min-w-[48px] px-3 rounded-[8px]'
	};
	/**
	 * Marks are sized off the scale, not off a multiplier. A multiplier was
	 * producing 10px wordmarks — a size that doesn't exist in the system, and one
	 * step below the 11px floor.
	 */
	const MARK = {
		sm: { text: 'text-11', glyph: 12 },
		md: { text: 'text-13', glyph: 16 },
		lg: { text: 'text-15', glyph: 24 }
	};

	const tileClass = $derived(TILE[p.size ?? 'md'] ?? TILE.md);
	const mark = $derived(MARK[p.size ?? 'md'] ?? MARK.md);
	const tiles = $derived(p.variant !== 'bare');

	/** Filled tiles carry the network's own colour; wallets sit on white. */
	const FILL: Record<Method, string> = {
		visa: '#1a1f71',
		mastercard: '#000000',
		amex: '#016fd0',
		discover: '#ffffff',
		paypal: '#ffffff',
		applepay: '#ffffff',
		googlepay: '#ffffff'
	};
	const OUTLINED: Method[] = ['paypal', 'applepay', 'googlepay', 'discover'];
	const LABELS: Record<Method, string> = {
		visa: 'Visa',
		mastercard: 'Mastercard',
		amex: 'American Express',
		discover: 'Discover',
		paypal: 'PayPal',
		applepay: 'Apple Pay',
		googlepay: 'Google Pay'
	};
</script>

<section class="mx-auto flex w-full {widthClass} flex-col items-center gap-4 px-gutter">
	{#if p.label}
		<p class="text-11 tracking-label text-fx-muted uppercase">{p.label}</p>
	{/if}

	<ul class="flex w-full flex-nowrap items-center justify-center gap-1">
		{#each methods as m (m)}
			<li
				class="flex flex-1 items-center justify-center {tiles ? tileClass : ''} {tiles &&
				OUTLINED.includes(m)
					? 'border border-[#d8d8d8]'
					: ''} {tiles && m === 'applepay' ? 'border-[#0a0a0a]' : ''}"
				style:background={tiles ? FILL[m] : undefined}
				aria-label={LABELS[m]}
			>
				{#if m === 'visa'}
					<span class="{mark.text} font-sans leading-none font-bold italic tracking-[-0.03em] text-white"
						>VISA</span
					>
				{:else if m === 'mastercard'}
					<span
						class="relative inline-block"
						style:width="{mark.glyph * 1.6}px"
						style:height="{mark.glyph}px"
					>
						<span
							class="absolute top-0 left-0 rounded-full bg-[#eb001b]"
							style:width="{mark.glyph}px"
							style:height="{mark.glyph}px"
						></span>
						<span
							class="absolute top-0 right-0 rounded-full bg-[#f79e1b] mix-blend-screen"
							style:width="{mark.glyph}px"
							style:height="{mark.glyph}px"
						></span>
					</span>
				{:else if m === 'amex'}
					<span
						class="{mark.text} font-sans leading-none font-bold tracking-[-0.02em] text-white"
						>AMEX</span
					>
				{:else if m === 'discover'}
					<span class="{mark.text} font-sans leading-none font-bold text-[#231f20]">
						DISC<span class="text-[#f48120]">O</span>VER
					</span>
				{:else if m === 'paypal'}
					<span class="{mark.text} font-sans leading-none font-bold italic">
						<span class="text-[#003087]">Pay</span><span class="text-[#009cde]">Pal</span>
					</span>
				{:else if m === 'applepay'}
					<span class="inline-flex items-center gap-1 text-black">
						<svg
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
							style:width="{mark.glyph}px"
							style:height="{mark.glyph}px"
						>
							<path
								d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.56 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.39-2.85 1.41-2.92-.03-.01-2.71-1.04-2.74-4.13zM14.6 4.6c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z"
							/>
						</svg>
						<span class="{mark.text} font-sans leading-none font-semibold">Pay</span>
					</span>
				{:else if m === 'googlepay'}
					<span class="inline-flex items-center gap-1">
						<svg
							viewBox="0 0 24 24"
							aria-hidden="true"
							style:width="{mark.glyph}px"
							style:height="{mark.glyph}px"
						>
							<path
								fill="#4285F4"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
							/>
							<path
								fill="#34A853"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
							/>
							<path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
							<path
								fill="#EA4335"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
							/>
						</svg>
						<span class="{mark.text} font-sans leading-none font-medium text-[#5f6368]">Pay</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>
