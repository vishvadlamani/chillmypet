<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `geo_offer` — a line personalised to the visitor's location.
	 *
	 * Renders nothing when geo is unknown rather than falling back to a generic
	 * string. "Reserved for founders in your area" is worse than silence, and geo
	 * resolves late or not at all often enough that the fallback would be what
	 * most visitors actually see. Pass `fallback` explicitly to override that.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** `{place}` is substituted with the visitor's city. */
			template?: string;
			/** Shown when geo is unavailable. Omit to render nothing. */
			fallback?: string;
			variant?: 'pill' | 'plain';
			/** The pulsing dot, on by default for the pill. */
			dot?: boolean;
			dotColor?: string;
			align?: 'left' | 'center';
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const variant = $derived(p.variant ?? 'pill');
	const centered = $derived(p.align !== 'left');

	const place = $derived(ctx.state.city());
	const text = $derived(
		place ? (p.template ?? 'Reserved for founders in {place}').replace('{place}', place) : (p.fallback ?? '')
	);
</script>

{#if text}
	<section class="mx-auto w-full {widthClass} px-gutter {centered ? 'text-center' : ''}">
		{#if variant === 'pill'}
			<p
				class="text-15 text-fx-sub rounded-pill inline-flex items-center gap-2 bg-white px-4 py-2"
			>
				{#if p.dot !== false}
					<span
						class="size-2 shrink-0 animate-pulse rounded-full"
						style:background={p.dotColor ?? '#34c84a'}
					></span>
				{/if}
				{text}
			</p>
		{:else}
			<p class="text-15 text-fx-sub">{text}</p>
		{/if}
	</section>
{/if}
