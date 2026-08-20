<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `scarcity_bar` — compact "N left" pill with a depletion meter.
	 *
	 * Distinct from `stock_progress`: that one is a full-width bar with a headline
	 * and owns its section, this sits inline next to a CTA without taking a row.
	 *
	 * The meter reflects `remaining / total`. The component this came from drew a
	 * fixed 10px fill regardless of the number beside it, so the bar said the same
	 * thing whether 3 or 300 were left.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** `{n}` is substituted with `remaining`. */
			template?: string;
			remaining?: number;
			total?: number;
			meterColor?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	const remaining = $derived(Math.max(0, p.remaining ?? 0));
	const total = $derived(Math.max(remaining, p.total ?? Math.max(remaining, 1)));
	const pct = $derived(Math.max(4, Math.round((remaining / total) * 100)));

	const parts = $derived((p.template ?? 'Due to high demand, {n} spots left').split('{n}'));
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	<div class="rounded-card inline-flex max-w-full items-center gap-2 bg-[#f5f5f5] px-2 py-1">
		<span class="text-13 text-fx-ink min-w-0 flex-1">
			{parts[0]}<span class="font-semibold">{remaining}</span>{parts[1] ?? ''}
		</span>
		<span
			class="h-3 w-10 shrink-0 overflow-hidden rounded-[3px] border border-[rgba(0,0,0,0.08)] bg-white"
			role="img"
			aria-label="{remaining} of {total} remaining"
		>
			<span class="block h-full" style:width="{pct}%" style:background={p.meterColor ?? '#f9494c'}
			></span>
		</span>
	</div>
</section>
