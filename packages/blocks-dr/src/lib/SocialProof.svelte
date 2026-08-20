<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `social_proof` — geo headline, aggregate rating, and a rail of review cards.
	 *
	 * One block, not three. The section, the rail and the card were three files
	 * that each imported the next and were never used apart; as separate blocks a
	 * manifest would have to place all three in the right order to get the thing
	 * anyone actually wants.
	 *
	 * Distinct from `reviews` (photo wall) and `testimonial` (one voice): this is
	 * the aggregate claim plus a few supporting quotes, which is a different
	 * argument and a different place on the page.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Card = {
		title?: string;
		body?: string;
		name?: string;
		rating?: number;
		verified?: boolean;
	};

	const p = $derived(
		(block.props ?? {}) as {
			/** `{city}` is substituted; `fallback` is used when geo is unknown. */
			heading?: string;
			fallback?: string;
			rating?: number;
			ratingLabel?: string;
			items?: Card[];
			accent?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const accent = $derived(p.accent ?? '#5dbd7e');
	const verifiedColor = '#1fa85c';

	const city = $derived(ctx.state.city());
	const heading = $derived(
		city && p.heading ? p.heading.replace('{city}', city) : (p.fallback ?? p.heading?.replace(' {city}', '') ?? '')
	);
	const items = $derived(p.items ?? []);
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	{#if heading}
		<h2 class="text-21 tracking-headline text-fx-ink font-serif">{heading}</h2>
	{/if}

	{#if p.rating}
		<p class="text-15 text-fx-sub mt-2 mb-4 flex items-center gap-2">
			{p.ratingLabel ?? 'Average rating'}
			{p.rating}
			<svg class="size-4" viewBox="0 0 24 24" fill={accent} aria-hidden="true">
				<path
					d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
				/>
			</svg>
		</p>
	{/if}

	{#if items.length}
		<!-- Snap rail, not a stack: these are supporting quotes, and three stacked
		     cards push the offer off the fold on a phone. -->
		<ul
			class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
		>
			{#each items as t, n (n)}
				<li class="w-[300px] max-w-[85%] shrink-0 snap-start">
					<article
						class="rounded-card flex h-full flex-col border border-[#e6e7ea] bg-white p-6"
					>
						{#if t.title}
							<h3 class="text-19 text-fx-ink font-bold">{t.title}</h3>
						{/if}
						{#if t.body}
							<p class="text-15 text-fx-sub mt-3">{t.body}</p>
						{/if}

						<div class="mt-auto pt-4">
							<div class="flex items-center justify-between gap-3">
								<span class="flex items-center gap-2">
									{#if t.verified !== false}
										<svg class="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
											<circle cx="12" cy="12" r="10" fill={verifiedColor} />
											<path
												d="m8 12.5 2.5 2.5L16 9.5"
												fill="none"
												stroke="#fff"
												stroke-width="2.4"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									{/if}
									<span class="text-15 text-fx-ink font-bold">{t.name}</span>
								</span>

								<span class="flex shrink-0 gap-1" aria-label="{t.rating ?? 5} out of 5">
									{#each [0, 1, 2, 3, 4] as i (i)}
										<span
											class="flex size-4 items-center justify-center rounded-[4px]"
											style:background={i < (t.rating ?? 5) ? accent : '#e8e6e3'}
										>
											<svg class="size-3" viewBox="0 0 24 24" fill="white" aria-hidden="true">
												<path
													d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.8l-5.8 3.06 1.1-6.46-4.69-4.58 6.49-.94z"
												/>
											</svg>
										</span>
									{/each}
								</span>
							</div>

							{#if t.verified !== false}
								<p class="text-13 mt-2" style:color={verifiedColor}>
									Verified Customer{city ? ` from ${city}` : ''}
								</p>
							{/if}
						</div>
					</article>
				</li>
			{/each}
		</ul>
	{/if}
</section>
