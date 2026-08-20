<script lang="ts">
	import { untrack } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `shipping_method` — how fast, and what that costs.
	 *
	 * Native radios in a `radiogroup`, not styled divs with click handlers:
	 * arrow-key cycling, the roving tab stop, screen-reader position ("2 of 2")
	 * and form participation all come free, and getting them right by hand is a
	 * lot of code that usually ends up half-done.
	 *
	 * Prices belong in `$ref`, not in the manifest. Rates change, free-shipping
	 * thresholds change, and a literal here is a delivery charge that disagrees
	 * with what the order is actually billed.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Option = {
		id?: string;
		label?: string;
		/** The delivery estimate — "5–8 business days". */
		detail?: string;
		/** Pre-formatted, because currency and locale are the host's business. */
		price?: string;
		selected?: boolean;
	};

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			options?: Option[];
			/** Host state key the chosen id is written to. */
			field?: string;
			/** Radio fill. Brand data, like the announcement tones. */
			accent?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const WIDTHS = {
		shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		full: 'max-w-none'
	};
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const field = $derived(p.field ?? 'shippingMethod');

	const options = $derived(
		(p.options ?? []).filter((o) => o.label).map((o, i) => ({ ...o, id: o.id ?? `option-${i}` }))
	);

	let chosen = $state('');

	/**
	 * Seed once, and WRITE THE DEFAULT BACK.
	 *
	 * A pre-checked radio that the host doesn't know about is the failure mode
	 * here: the visitor sees Standard selected, never touches it, and the order
	 * arrives with no shipping method at all. Anything shown as chosen has to be
	 * chosen in state too.
	 */
	$effect(() => {
		untrack(() => {
			if (chosen) return;
			const stored = ctx.state.get(field);
			const valid = options.some((o) => o.id === stored);
			const initial = valid ? stored : (options.find((o) => o.selected) ?? options[0])?.id;
			if (!initial) return;
			chosen = initial;
			if (initial !== stored) ctx.state.set(field, initial);
		});
	});

	function choose(id: string) {
		chosen = id;
		ctx.state.set(field, id);
		const picked = options.find((o) => o.id === id);
		ctx.track('shipping_method_selected', { method: id, price: picked?.price });
	}
</script>

{#if options.length}
	<section class="mx-auto flex w-full {widthClass} flex-col gap-4 px-gutter">
		{#if p.heading}
			<h2 id="{block.id}-label" class="text-21 tracking-headline text-fx-ink font-bold">
				{p.heading}
			</h2>
		{/if}

		<div
			class="rounded-field overflow-hidden border border-[#d8d5cf] bg-white"
			role="radiogroup"
			aria-labelledby={p.heading ? `${block.id}-label` : undefined}
			aria-label={p.heading ? undefined : 'Shipping method'}
		>
			{#each options as o, i (o.id)}
				<!-- The whole row is the label, so the tap target is the row rather
				     than a 20px circle — on a phone that difference is most of the
				     misses. -->
				<label
					class="flex cursor-pointer items-center gap-3 border-b border-[#e2e0dc] px-4 py-4 last:border-b-0"
				>
					<input
						type="radio"
						name="{block.id}-method"
						value={o.id}
						checked={chosen === o.id}
						onchange={() => choose(o.id)}
						class="size-5 shrink-0"
						style:accent-color={p.accent ?? '#2b6a8f'}
					/>

					<span class="min-w-0 flex-1">
						<span class="text-17 text-fx-ink block">{o.label}</span>
						{#if o.detail}
							<span class="text-15 text-fx-sub block">{o.detail}</span>
						{/if}
					</span>

					{#if o.price}
						<span class="text-17 text-fx-ink shrink-0 font-semibold tabular-nums">{o.price}</span>
					{/if}
				</label>
			{/each}
		</div>
	</section>
{/if}
