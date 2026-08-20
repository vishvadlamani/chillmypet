<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `divider` — a rule between sections.
	 *
	 * A block rather than a `dividers` flag on the layout, because "between every
	 * block" is the wrong rule on a real page: nobody wants a line under a
	 * full-bleed countdown bar or above a fixed dock. Placing it in the manifest
	 * means the page decides where a section actually ends.
	 *
	 * Renders `<hr>`, so it's a separator to a screen reader too — a styled `div`
	 * would be silent, and this is the element that says "new section" to someone
	 * navigating by structure.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			width?: 'shell' | 'page' | 'article' | 'full';
			/** Vertical breathing room around the rule. */
			spacing?: 'tight' | 'normal' | 'loose';
			color?: string;
		}
	);

	const WIDTHS = {
		shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		full: 'max-w-none'
	};
	const SPACING = { tight: 'my-2', normal: 'my-6', loose: 'my-10' };

	const widthClass = $derived(WIDTHS[p.width ?? 'shell'] ?? WIDTHS.shell);
	const spacingClass = $derived(SPACING[p.spacing ?? 'normal'] ?? SPACING.normal);
</script>

<div class="mx-auto w-full {widthClass} px-gutter">
	<hr class="{spacingClass} border-0 border-t" style:border-color={p.color ?? '#e2e0dc'} />
</div>
