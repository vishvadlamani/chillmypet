<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `testimonial` — one review, or several behind dots.
	 *
	 * Same reasoning as the countdown: a single review and a carousel are the same
	 * block. The card is identical; only navigation appears once there's more than
	 * one item, so a manifest that grows from one review to five needs no edit.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Item = {
		quote?: string;
		name?: string;
		avatar?: string;
		rating?: number;
		/** `pullquote` only — the line lifted big above the body copy. */
		pull?: string;
	};

	const p = $derived(
		(block.props ?? {}) as {
			items?: Item[];
			/**
			 * `plain` (default) sits on the page; `card` boxes it; `pullquote` lifts
			 * one line big above the body and moves the attribution to a footer row.
			 */
			variant?: 'card' | 'plain' | 'pullquote';
			/** `pullquote` only — a lead-in above the quote. */
			headline?: string;
			showRating?: boolean;
			/** ms between slides. Omitted = manual only, which is the kinder default. */
			autoplayMs?: number;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	const items = $derived(p.items?.length ? p.items : []);
	const many = $derived(items.length > 1);
	let i = $state(0);
	const current = $derived(items[Math.min(i, items.length - 1)]);

	$effect(() => {
		if (!many || !p.autoplayMs) return;
		const id = setInterval(() => (i = (i + 1) % items.length), p.autoplayMs);
		return () => clearInterval(id);
	});

	function go(n: number) {
		i = n;
		ctx.track('testimonial_view', { index: n });
	}

	// Borderless by default. A review sitting directly on the page reads as part
	// of it; boxing it makes it look like an ad for itself. `card` is opt-in for
	// when the surrounding page needs the separation.
	const card = $derived(
		p.variant === 'card'
			? 'rounded-card border border-[#e2e0dc] bg-white p-[clamp(1.125rem,2vw,1.5rem)]'
			: ''
	);
	const pullquote = $derived(p.variant === 'pullquote');
</script>

{#if current && pullquote}
	<section class="mx-auto w-full {widthClass} px-gutter">
		{#if p.headline}
			<h2 class="text-17 tracking-snug text-fx-ink font-serif">{p.headline}</h2>
		{/if}

		<div class="rounded-card bg-fx-surface mt-6 p-6">
			{#if current.pull}
				<p class="text-21 tracking-headline text-fx-ink font-bold">&ldquo;{current.pull}&rdquo;</p>
			{/if}
			{#if current.quote}
				<p class="text-15 text-fx-sub mt-3">&ldquo;{current.quote}&rdquo;</p>
			{/if}

			<div class="mt-4 flex items-center gap-2">
				{#if current.avatar}
					<img
						src={current.avatar}
						alt=""
						class="bg-fx-surface-hover size-10 shrink-0 rounded-full object-cover"
						loading="lazy"
					/>
				{/if}
				<div>
					{#if current.name}
						<p class="text-15 text-fx-ink font-semibold">{current.name}</p>
					{/if}
					<p class="text-13 text-fx-muted">
						Verified customer{ctx.state.city() ? ` from ${ctx.state.city()}` : ''}
					</p>
				</div>
			</div>
		</div>
	</section>
{:else if current}
	<div class="mx-auto w-full {widthClass} px-gutter">
	<section class={card}>
		<div class="flex items-start gap-4">
			{#if current.avatar}
				<img
					src={current.avatar}
					alt=""
					class="size-10 shrink-0 rounded-full object-cover"
					loading="lazy"
				/>
			{/if}
			<blockquote class="text-17 tracking-snug text-fx-ink min-w-0 flex-1">
				{current.quote}
			</blockquote>
		</div>

		{#if current.name || (p.showRating !== false && current.rating)}
			<div class="mt-4 border-t border-[#e2e0dc] pt-3">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					{#if current.name}
						<span class="text-13 text-fx-muted">{current.name}</span>
					{/if}
					{#if p.showRating !== false && current.rating}
						<span class="flex items-center gap-1" aria-label="{current.rating} out of 5">
							{#each Array(5) as _, s (s)}
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill={s < (current.rating ?? 0) ? '#ffc107' : '#e2e0dc'}
									aria-hidden="true"
								>
									<path
										d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
									/>
								</svg>
							{/each}
						</span>
					{/if}
				</div>
			</div>
		{/if}

		{#if many}
			<div class="mt-4 flex justify-center gap-2">
				{#each items as _, n (n)}
					<button
						type="button"
						onclick={() => go(n)}
						aria-label="Review {n + 1} of {items.length}"
						aria-current={n === i}
						class="size-2 rounded-full transition-colors {n === i
							? 'bg-fx-ink'
							: 'bg-[#c9c6c0] hover:bg-fx-muted'}"
					></button>
				{/each}
			</div>
		{/if}
	</section>
	</div>
{/if}
