<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `promo_applied` — confirmation that a code is on the order.
	 *
	 * Read-only by design: it reports state the host already holds rather than
	 * owning the code. Entry and validation belong with whatever computes the
	 * price, not in a presentation block that could show "Activated" over an
	 * order that was never discounted.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			label?: string;
			/** The code itself. `$ref` it — a literal is a promo that can't expire. */
			code?: string;
			status?: string;
			note?: string;
			statusColor?: string;
			/** Read the live code out of host state instead of props. */
			codeField?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	const code = $derived(p.codeField ? ctx.state.get(p.codeField) || p.code : p.code);
</script>

{#if code}
	<section class="mx-auto w-full {widthClass} px-gutter">
		<div class="rounded-card bg-white p-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
			<div class="flex items-center gap-3">
				<span class="text-15 text-fx-muted w-14 shrink-0 text-center font-medium">
					{p.label ?? 'Promo'}
				</span>
				<span class="text-15 text-fx-sub min-w-0 flex-1 truncate font-medium">{code}</span>
				<span
					class="rounded-pill shrink-0 p-1"
					style:background={p.statusColor ?? '#26BC2B'}
				>
					<span class="text-13 block w-20 text-center font-semibold text-white">
						{p.status ?? 'Activated'}
					</span>
				</span>
			</div>
		</div>

		{#if p.note}
			<p class="text-13 text-fx-muted mt-1">{p.note}</p>
		{/if}
	</section>
{/if}
