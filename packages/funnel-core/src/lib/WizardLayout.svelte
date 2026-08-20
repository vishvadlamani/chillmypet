<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		funnelVersion,
		resolveBlocks,
		type Block,
		type FunnelDefinition,
		type FunnelStateAdapter,
		type SubmitFn,
		type TrackFn,
		type WizardContext
	} from './index';
	import type { ShellComponent, WizardComponentMap } from './svelte';

	/**
	 * `layout: 'wizard'` — one block at a time, advanced by the visitor.
	 *
	 * Everything app-shaped is injected: which components draw which block types
	 * (`components`), where events go (`track`), where answers live (`state`), and
	 * what chrome wraps it (`shell` / `progress` / `pinnedCta`). What's left is the
	 * part that's actually the same everywhere — ordering, progress, step events,
	 * and the next/back rules — so this file lifts into another project unchanged.
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
		onComplete,
		onExit,
		shell: Shell,
		progress,
		pinnedCta,
		index = $bindable(0)
	}: {
		definition: FunnelDefinition;
		components: WizardComponentMap;
		track: TrackFn;
		/** Handles block side effects. Omit for a funnel whose blocks have none. */
		submit?: SubmitFn;
		/**
		 * Content version, when the host already knows it — pass the version of the
		 * *authored* definition if you resolved `$ref` props, since binding live
		 * data must not mint a new version. Defaults to hashing what it's given.
		 */
		version?: string;
		state: FunnelStateAdapter;
		/** Last block advanced past — the host decides where the funnel goes next. */
		onComplete: (block: Block) => void;
		/** Back pressed on the first block. */
		onExit: () => void;
		shell?: ShellComponent;
		/** Progress affordance, handed the completion percentage. */
		progress?: Snippet<[number]>;
		/** Footer CTA for `pinned` blocks, handed the advance callback. */
		pinnedCta?: Snippet<[() => void]>;
		/** Current step. Bindable so the host can read it (or deep-link into one). */
		index?: number;
	} = $props();

	const version = $derived(versionProp ?? funnelVersion(definition));

	// Blocks this build can actually draw. Unknown types are skipped rather than
	// rendered blank, so a manifest published with a newer block still works here.
	const resolved = $derived(
		resolveBlocks(definition, components, (b) =>
			console.warn(`[funnel] ${definition.id}: no component for block "${b.component}"`)
		)
	);
	const total = $derived(resolved.length);

	/**
	 * The step actually shown. `index` is bindable and the definition can change
	 * underneath it (a registry A/B swap, a live edit, a block this build can't
	 * draw), so an unclamped read strands the visitor on a blank step with no CTA
	 * and no way forward. Clamping renders the nearest real step instead.
	 */
	const pos = $derived(total ? Math.min(Math.max(index, 0), total - 1) : 0);
	const entry = $derived(resolved[pos]);
	const current = $derived(entry?.block);
	const Render = $derived(entry?.component.render);
	const pinned = $derived(entry?.component.pinned ?? false);
	const pct = $derived(total ? Math.round(((pos + 1) / total) * 100) : 0);

	// Keep the host's bound value honest once we've clamped, so it doesn't keep
	// reporting a step that doesn't exist.
	$effect(() => {
		if (index !== pos) index = pos;
	});

	// Stamp the funnel id/version onto the session before anything is logged, so
	// every event this visit attributes to the exact manifest that produced it.
	// Untracked inside: `begin` is host code, and a host that reads its own reactive
	// state there would otherwise make this effect depend on it and re-run forever.
	$effect(() => {
		const info = { funnelId: definition.id, version, layout: 'wizard' as const };
		untrack(() => adapter.begin(info));
	});

	// One step_view per block reached — the raw signal for drop-off. untrack so it
	// fires on block change only, not when something the block touches updates.
	$effect(() => {
		const b = current;
		if (b) untrack(() => track('step_view', b));
	});

	function next() {
		if (pos < total - 1) index = pos + 1;
		else if (current) onComplete(current);
	}

	function back() {
		if (pos > 0) index = pos - 1;
		else onExit();
	}

	const ctx: WizardContext = $derived({
		track: (event, props) => {
			if (current) track(event, current, props);
		},
		submit: (action, payload) => {
			if (!current) return;
			if (submit) submit(action, current, payload);
			else console.warn(`[funnel] block "${current.id}" submitted "${action}" with no handler`);
		},
		state: adapter,
		index: pos,
		total,
		next,
		back
	});
</script>

{#snippet body()}
	{@render progress?.(pct)}

	{#key pos}
		<div in:fade={{ duration: 150 }}>
			{#if Render}
				<Render block={current} {ctx} />
			{/if}
		</div>
	{/key}
{/snippet}

{#snippet footer()}
	{@render pinnedCta?.(next)}
{/snippet}

{#if Shell}
	<Shell onback={back} footer={pinned && pinnedCta ? footer : undefined}>
		{@render body()}
	</Shell>
{:else}
	{@render body()}
	{#if pinned && pinnedCta}{@render footer()}{/if}
{/if}
