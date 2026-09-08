<script lang="ts">
	import { untrack } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `size_picker` — the second option axis, which nothing in the block library
	 * covers.
	 *
	 * `bundles` carries ONE choice per unit and the storefront spends it on
	 * colour, so until this existed the page sold five sizes and let a visitor
	 * pick none of them: the host resolved every order to the first size that
	 * happened to be in stock. A life jacket page with a size chart on it that
	 * ships whatever it likes is not a display bug, it is the wrong parcel.
	 *
	 * A HOST block, not a `blocks-dr` one, because `packages/blocks-dr` is a copy
	 * with no registry behind it — anything added there diverges from upstream
	 * silently and permanently. `PageComponentMap` is injected precisely so a
	 * host can bring its own, and the host's keys win on collision.
	 *
	 * It states intent and stops, like every other block: it writes the chosen
	 * size into funnel state under `field` and never learns what a variant id is.
	 * Turning (colour, size) into one is the host's job in `+page.svelte`.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			/** Usually a `$ref` — the catalogue knows which sizes exist, not the author. */
			options?: { value: string; label?: string; available?: boolean }[];
			/** Funnel-state key the choice is written to. */
			field?: string;
			note?: string;
			soldOutLabel?: string;
			width?: 'shell' | 'page' | 'article' | 'measure' | 'full';
		}
	);

	const options = $derived(p.options ?? []);
	const field = $derived(p.field ?? 'size');
	const buyable = $derived(options.filter((o) => o.available !== false));

	const WIDTHS = {
		shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		measure: 'max-w-measure',
		full: 'max-w-none'
	};
	const widthClass = $derived(WIDTHS[p.width ?? 'full'] ?? WIDTHS.full);

	let chosen = $state('');

	/**
	 * Seed once, and write the default back — the same contract the bundle picker
	 * keeps. A size shown as selected that the host does not have in state is an
	 * order placed in whatever size the fallback picks, which is the bug this
	 * block exists to close.
	 *
	 * Untracked, because it reads the state it writes: an unguarded write here
	 * re-triggers the effect that made it.
	 */
	$effect(() => {
		const first = buyable[0]?.value;
		untrack(() => {
			if (chosen) return;
			const stored = ctx.state.get(field);
			const initial = buyable.some((o) => o.value === stored) ? stored : first;
			if (!initial) return;
			chosen = initial;
			if (initial !== stored) ctx.state.set(field, initial);
		});
	});

	function choose(value: string) {
		chosen = value;
		ctx.state.set(field, value);
		ctx.track('size_selected', { size: value });
	}
</script>

<!-- One size is not a choice, and a row with a single button in it reads as a
     control that is broken rather than one that is unnecessary. -->
{#if options.length > 1}
	<section class="mx-auto flex w-full {widthClass} flex-col gap-2 px-gutter">
		{#if p.heading}
			<span id="{block.id}-label" class="text-15 text-fx-sub">{p.heading}</span>
		{/if}

		<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="{block.id}-label">
			{#each options as o (o.value)}
				{@const sold = o.available === false}
				<button
					type="button"
					role="radio"
					aria-checked={chosen === o.value}
					disabled={sold}
					onclick={() => choose(o.value)}
					class="rounded-field text-15 min-w-14 border px-4 py-2 transition
					       {chosen === o.value
						? 'border-fx-ink text-fx-ink border-2 font-semibold'
						: 'text-fx-ink border-[#d8d5cf] bg-white'}
					       {sold ? 'cursor-not-allowed text-fx-sub line-through opacity-45' : ''}"
				>
					{o.label ?? o.value}
				</button>
			{/each}
		</div>

		{#if p.note}
			<p class="text-13 text-fx-sub">{p.note}</p>
		{/if}

		<!-- Nothing buyable is a real state — every size of a colourway can sell
		     out — and it has to say so, because a row of struck-through buttons
		     above a live "Buy now" is a page arguing with itself. -->
		{#if buyable.length === 0}
			<p class="text-13 font-semibold text-[#a33]">{p.soldOutLabel ?? 'Sold out'}</p>
		{/if}
	</section>
{/if}
