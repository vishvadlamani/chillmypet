<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import {
		funnelVersion,
		groupRows,
		resolveBlocks,
		type Block,
		type FlowContext,
		type FunnelDefinition,
		type FunnelStateAdapter,
		type SubmitFn,
		type TrackFn
	} from './index';
	import type { PageComponentMap } from './svelte';

	/**
	 * `layout: 'page'` — every block stacked on one scroll (sales page, advertorial,
	 * product page). Same definition, same block contract and same analytics as the
	 * wizard; only the arrangement differs.
	 *
	 * Carries no chrome or styling of its own — `header`, `rootClass` and
	 * `mainClass` come from the host, so this file lifts unchanged.
	 */
	let {
		definition,
		components,
		track,
		submit,
		version: versionProp,
		// Bound locally as `adapter`: a top-level binding called `state` would
		// shadow the `$state` rune for anyone editing this file later.
		state: adapter,
		header,
		rootClass = '',
		mainClass = '',
		rowClass = 'grid gap-8 md:grid-cols-12',
		colClass = 'flex flex-col gap-4'
	}: {
		definition: FunnelDefinition;
		components: PageComponentMap;
		track: TrackFn;
		/** Handles block side effects. Omit for a page whose blocks have none. */
		submit?: SubmitFn;
		/**
		 * Content version, when the host already knows it — pass the version of the
		 * *authored* definition if you resolved `$ref` props, since binding live
		 * data must not mint a new version. Defaults to hashing what it's given.
		 */
		version?: string;
		state: FunnelStateAdapter;
		/** Page chrome above the blocks (logo, nav, …). */
		header?: Snippet;
		rootClass?: string;
		mainClass?: string;
		/**
		 * Applied to a multi-block row. The host owns it, same as `mainClass` — how
		 * wide a two-column hero runs and how far apart its columns sit is a brand
		 * decision, not something this file should have an opinion about.
		 */
		rowClass?: string;
		/** Applied to each column — the vertical rhythm of blocks stacked in one. */
		colClass?: string;
	} = $props();

	const version = $derived(versionProp ?? funnelVersion(definition));

	// Unknown block types are skipped, not rendered blank — a manifest published
	// with a block this build doesn't know still serves the rest of the page.
	const resolved = $derived(
		resolveBlocks(definition, components, (b) =>
			console.warn(`[funnel] ${definition.id}: no component for block "${b.component}"`)
		)
	);
	const total = $derived(resolved.length);
	const rows = $derived(groupRows(resolved));
	/** Position within the whole page, which is what `ctx.index` means. */
	const indexOf = $derived(new Map(resolved.map((r, i) => [r.key, i])));

	// Written out in full because Tailwind only generates classes it can read
	// literally — a computed `md:col-span-${n}` produces no CSS at all.
	const SPANS: Record<number, string> = {
		1: 'md:col-span-1',
		2: 'md:col-span-2',
		3: 'md:col-span-3',
		4: 'md:col-span-4',
		5: 'md:col-span-5',
		6: 'md:col-span-6',
		7: 'md:col-span-7',
		8: 'md:col-span-8',
		9: 'md:col-span-9',
		10: 'md:col-span-10',
		11: 'md:col-span-11',
		12: 'md:col-span-12'
	};

	/**
	 * Blocks carry their own horizontal gutter, because a block dropped straight
	 * into a page has nothing else to give it one. Inside a column that gutter is
	 * wrong twice over: the row already paid it, and a block that adds a second
	 * one sits indented from the neighbours in its column that don't.
	 *
	 * That isn't a per-block bug to fix twenty times — it's the difference between
	 * "I am the page section" and "I am in a column", and only this file knows
	 * which. So the column cancels it and blocks stay ignorant of where they
	 * landed. Not part of `colClass`: a host overriding that shouldn't be able to
	 * turn structural behaviour off by accident.
	 */
	const NO_CHILD_GUTTER = '[&>*]:px-0';

	/**
	 * Width of a column, in twelfths.
	 *
	 * Omitting `span` emits no span class at all — the row's own grid template
	 * places the column. That's the escape hatch from twelfths, and it's needed:
	 * the 55/45 product hero that DR storefronts run is 6.6/5.4 of twelve, which
	 * no 12-column grid can express. A host wanting it exactly sets
	 * `md:grid-cols-[55fr_45fr]` on `rowClass` and leaves `span` off.
	 *
	 * `min-w-0` is load-bearing and applies either way. A grid item defaults to
	 * `min-width: auto`, so any column holding something intrinsically wide — a
	 * thumbnail rail, a table, a long unbroken string — refuses to shrink below
	 * its content and pushes the track past the viewport. It shows up as
	 * horizontal scroll on phones and nowhere else.
	 */
	function spanClass(span: number | undefined): string {
		const base = `min-w-0 ${NO_CHILD_GUTTER}`;
		if (span === undefined) return base;
		return `${base} ${SPANS[Math.min(12, Math.max(1, span))] ?? SPANS[12]}`;
	}

	// Re-stamps when the definition changes, but untracked inside: `begin` is host
	// code, and a host that reads its own reactive state here would otherwise make
	// this effect depend on it and re-run forever.
	$effect(() => {
		const info = { funnelId: definition.id, version, layout: 'page' as const };
		untrack(() => adapter.begin(info));
	});

	onMount(() => {
		track('page_view', { id: definition.id, component: 'page' });
	});

	/** Per-block seam. `track` arrives pre-stamped with the block it came from. */
	function contextFor(block: Block, index: number): FlowContext {
		return {
			track: (event, props) => track(event, block, props),
			submit: (action, payload) => {
				if (submit) submit(action, block, payload);
				else console.warn(`[funnel] block "${block.id}" submitted "${action}" with no handler`);
			},
			state: adapter,
			index,
			get total() {
				return total;
			}
		};
	}
</script>

<div class={rootClass}>
	{@render header?.()}

	<main class={mainClass}>
		{#each rows as row (row.key)}
			{#if row.bare}
				<!-- Rendered unwrapped. A wrapper would become the containing block for
				     anything `position: sticky` inside it — and since the wrapper is
				     exactly its child's height, the sticky element would have nowhere to
				     travel and would silently stop sticking. -->
				{@const only = row.columns[0].items[0]}
				{@const Render = only.component.render}
				<Render block={only.block} ctx={contextFor(only.block, indexOf.get(only.key) ?? 0)} />
			{:else}
				<!-- A row that names itself keeps its grid and its span even while it
				     holds one column, so filling in the second column later doesn't
				     move the first. -->
				<div class={rowClass}>
					{#each row.columns as column (column.key)}
						<div class="{colClass} {spanClass(column.span)}">
							{#each column.items as item (item.key)}
								{@const Render = item.component.render}
								<Render
									block={item.block}
									ctx={contextFor(item.block, indexOf.get(item.key) ?? 0)}
								/>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</main>
</div>
