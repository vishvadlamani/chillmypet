<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import Countdown from './Countdown.svelte';

	/**
	 * `reserved_spot` — "Spot reserved. Expires in MM:SS".
	 *
	 * A composition, not a second timer. Everything hard about it — resolving the
	 * window, persisting the start so a refresh doesn't hand out a fresh 15
	 * minutes, ticking without jitter, deciding what happens at zero — already
	 * lives in `countdown`. This block is the icon, the copy and the defaults.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			minutes?: number;
			/** Copy before the clock. */
			template?: string;
			timerColor?: string;
			icon?: boolean;
			onExpire?: 'hide' | 'zeros' | 'message';
			expiredMessage?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	// Same block id, so the persisted window and any events stay attributed here.
	const inner = $derived({
		id: block.id,
		component: 'countdown',
		version: block.version,
		props: {
			variant: 'inline',
			size: 'sm',
			durationMinutes: p.minutes ?? 15,
			prefix: p.template ?? 'Spot reserved. Expires in',
			showHours: false,
			showDays: false,
			digitColor: p.timerColor ?? '#f9494c',
			onExpire: p.onExpire ?? 'hide',
			expiredMessage: p.expiredMessage
		}
	} satisfies Block);
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	<div class="relative flex items-center justify-center">
		{#if p.icon !== false}
			<svg
				class="text-fx-ink absolute left-0 size-5 shrink-0"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="10" x2="14" y1="2" y2="2" />
				<line x1="12" x2="15" y1="14" y2="11" />
				<circle cx="12" cy="14" r="8" />
			</svg>
		{/if}
		<p class="text-15 text-fx-ink w-full text-center font-medium">
			<Countdown block={inner} {ctx} />
		</p>
	</div>
</section>
