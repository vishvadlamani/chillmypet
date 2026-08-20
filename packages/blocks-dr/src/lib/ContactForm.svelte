<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import FieldGroup from './FieldGroup.svelte';
	import { resolveFields, type Field, type FieldName } from './fields';

	/**
	 * `contact_form` — who the order belongs to and how to reach them.
	 *
	 * Split from `shipping_form` because the two get placed apart and change
	 * independently: a digital product needs contact and no address at all, and
	 * "who are you" is a different question from "where does it go".
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			fields?: (FieldName | Field)[];
			variant?: 'grouped' | 'stacked';
			submitLabel?: string;
			action?: string;
			note?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const DEFAULT: FieldName[] = ['fullName', 'email', 'phone'];
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const fields = $derived(resolveFields(p.fields, DEFAULT));
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	<FieldGroup
		id={block.id}
		{ctx}
		{fields}
		heading={p.heading}
		variant={p.variant}
		submitLabel={p.submitLabel}
		action={p.action ?? 'contact'}
		note={p.note}
	/>
</section>
