<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { fill, monthName } from './tokens';

	/**
	 * `stock_progress` — a depletion bar with its headline.
	 *
	 * `sold` is the prop a manifest binds: `{ "sold": { "$ref": "stock.sold_pct" } }`
	 * resolves server-side, so the same block serves a literal during layout work
	 * and live inventory in production without an edit. Pass `remaining` + `total`
	 * instead when the source gives you units rather than a percentage.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** `{month}` is substituted with the current month. Set `''` to hide. */
			label?: string;
			/** 0–100. Wins over remaining/total when both are present. */
			sold?: number;
			remaining?: number;
			total?: number;
			/** Language for `{month}`. Fixed default so SSR and the client agree. */
			locale?: string;
			icon?: string;
			/** Bar fill + label colour. Campaign data, like the announcement tones. */
			accent?: string;
			track?: string;
			size?: 'sm' | 'md' | 'lg';
			/** `{pct}` is substituted. */
			soldLabel?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	const pct = $derived.by(() => {
		const raw =
			typeof p.sold === 'number'
				? p.sold
				: typeof p.remaining === 'number' && p.total
					? ((p.total - p.remaining) / p.total) * 100
					: 0;
		return Math.min(100, Math.max(0, Math.round(raw)));
	});

	const accent = $derived(p.accent ?? '#b5522f');
	const icon = $derived(p.icon ?? '⚠️');
	const track = $derived(p.track ?? '#e8e8e8');
	const soldText = $derived((p.soldLabel ?? '{pct}% sold').replace('{pct}', String(pct)));

	/**
	 * The month is computed, not authored — that's the whole reason the headline
	 * reads "August Stock" without anyone republishing anything on the 1st.
	 */
	const labelText = $derived(fill(p.label ?? '{month} Stock', { month: monthName(p.locale) }));

	const TEXT = { sm: 'text-13', md: 'text-17', lg: 'text-21' };
	const BAR = { sm: 'h-1', md: 'h-2', lg: 'h-3' };
	const textClass = $derived(TEXT[p.size ?? 'md'] ?? TEXT.md);
	const barClass = $derived(BAR[p.size ?? 'md'] ?? BAR.md);
</script>

<section class="mx-auto flex w-full {widthClass} flex-col gap-2 px-gutter">
	<div
		class="w-full overflow-hidden rounded-pill {barClass}"
		style:background={track}
		role="progressbar"
		aria-valuenow={pct}
		aria-valuemin="0"
		aria-valuemax="100"
		aria-label={labelText ? `${labelText} — ${soldText}` : soldText}
	>
		<!-- rounded-pill on the fill too, so a low percentage reads as a lozenge
		     rather than a sliver with one square end. -->
		<div class="h-full rounded-pill transition-[width] duration-500" style:width="{pct}%" style:background={accent}></div>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
		<!-- Only rendered when `label` resolves to something. An empty <p> is still a
		     flex item, so `justify-between` would strand the sold text on the right. -->
		{#if labelText}
			<p class="{textClass} flex items-center gap-2 font-bold tracking-headline" style:color={accent}>
				{#if icon}<span aria-hidden="true">{icon}</span>{/if}
				{labelText}
			</p>
		{/if}
		<p class="{textClass} text-fx-ink font-bold tabular-nums tracking-headline">{soldText}</p>
	</div>
</section>
