<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize, fill, monthName } from './tokens';

	/**
	 * `bullet_list` — the benefit lines under a product title.
	 *
	 * The emoji is the marker, so this renders a real `<ul>` with the browser's
	 * own bullets suppressed rather than a stack of `<div>`s: it's a list, and a
	 * screen reader announcing "list, 4 items" is information the visual version
	 * gives away for free.
	 *
	 * `**bold**` inside each line is what makes it read as marketing copy instead
	 * of a spec sheet — the emphasis lands on the claim, not the connective.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Item = { icon?: string; text?: string };

	const p = $derived(
		(block.props ?? {}) as {
			items?: Item[];
			size?: 'sm' | 'md' | 'lg';
			/** Vertical rhythm between lines. */
			spacing?: 'tight' | 'normal' | 'loose';
			width?: 'shell' | 'page' | 'article' | 'measure' | 'full';
		}
	);

	const SIZES = { sm: 'text-15', md: 'text-17', lg: 'text-19' };
	const GAPS = { tight: 'gap-1', normal: 'gap-2', loose: 'gap-3' };
	const WIDTHS = { shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		measure: 'max-w-measure',
		full: 'max-w-none'
	};

	const sizeClass = $derived(SIZES[p.size ?? 'lg'] ?? SIZES.lg);
	const gapClass = $derived(GAPS[p.spacing ?? 'normal'] ?? GAPS.normal);
	const widthClass = $derived(WIDTHS[p.width ?? 'full'] ?? WIDTHS.full);
	const items = $derived((p.items ?? []).filter((i) => i.text));
</script>

{#if items.length}
	<ul class="mx-auto flex w-full {widthClass} list-none flex-col {gapClass} p-0">
		{#each items as item, n (n)}
			<li class="{sizeClass} text-fx-ink flex items-start gap-2">
				{#if item.icon}
					<!-- aria-hidden: the emoji is decoration here, and read aloud it turns
					     "Perfect for anxious pets" into "paw prints, perfect for…". -->
					<span class="shrink-0 leading-[1.4]" aria-hidden="true">{item.icon}</span>
				{/if}
				<span class="min-w-0"
					>{#each emphasize(fill(item.text ?? '', { month: monthName() })) as s, i (i)}{#if s.strong}<strong
								class="font-bold">{s.text}</strong
							>{:else}{s.text}{/if}{/each}</span
				>
			</li>
		{/each}
	</ul>
{/if}
