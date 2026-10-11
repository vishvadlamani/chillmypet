<script lang="ts">
	import { onMount } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * Design, then size, then one button.
	 *
	 * The block states what was chosen and stops. Option CODES go out through
	 * `submit`, never a variant id or a URL: which variant that pair is, and
	 * where the buyer goes next, are the host's business.
	 *
	 * The size starts empty on purpose. It is the wearer's size, and only the
	 * wearer knows it; a default would quietly ship every order in S.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Design = { code: string; label: string; swatch?: string; image?: string };
	type Size = { code: string; label: string };

	const p = $derived(
		(block.props ?? {}) as {
			designs?: Design[];
			sizes?: Size[];
			/** `design:size` pairs that can be bought. Anything else is greyed out. */
			available?: string[];
			price?: string;
			priceNote?: string;
			designLabel?: string;
			sizeLabel?: string;
			sizeNote?: string;
			sizeGuideHref?: string;
			sizeGuideLabel?: string;
			sizeMissing?: string;
			cta?: string;
		}
	);

	const designs = $derived(p.designs ?? []);
	const sizes = $derived(p.sizes ?? []);
	const available = $derived(new Set(p.available ?? []));

	const design = $derived(
		designs.find((d) => d.code === ctx.state.get('design'))?.code ?? designs[0]?.code ?? ''
	);
	const size = $derived(
		sizes.some((s) => s.code === ctx.state.get('size')) ? ctx.state.get('size') : ''
	);
	const buyable = (d: string, s: string) => available.has(`${d}:${s}`);
	// The host writes a fresh token here when someone taps buy (here or on the
	// sticky bar) before choosing a size. Asking is this block's job, because
	// only it knows where its own size buttons are.
	const promptToken = $derived(ctx.state.get('size_prompt'));
	const prompted = $derived(Boolean(promptToken) && !size);

	let sizeFieldset = $state<HTMLFieldSetElement | null>(null);
	let answered = '';

	onMount(() => {
		// A prompt persisted from an earlier view of this page is not a question
		// anyone just asked.
		if (ctx.state.get('size_prompt')) ctx.state.set('size_prompt', '');
	});

	$effect(() => {
		if (!prompted || !sizeFieldset || promptToken === answered) return;
		answered = promptToken;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		sizeFieldset.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
		sizeFieldset.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus({
			preventScroll: true
		});
	});

	function pickDesign(code: string) {
		ctx.state.set('design', code);
		// A size that this design doesn't come in can't stay selected.
		if (size && !buyable(code, size)) ctx.state.set('size', '');
		ctx.track('design_selected', { design: code });
	}

	function pickSize(code: string) {
		ctx.state.set('size', code);
		ctx.state.set('size_prompt', '');
		ctx.track('size_selected', { size: code });
	}

	function add() {
		ctx.submit('add_to_cart', { design, size, units: 1, source: 'picker' });
		ctx.track('add_to_cart_click', { source: 'picker', design, size });
	}

	const designName = $derived(designs.find((d) => d.code === design)?.label ?? '');
</script>

<div class="picker" id="variant-picker">
	{#if p.price}
		<p class="price">
			<span class="amount">{p.price}</span>
			{#if p.priceNote}<span class="note">{p.priceNote}</span>{/if}
		</p>
	{/if}

	<fieldset>
		<legend>
			{p.designLabel ?? 'Design'}: <strong>{designName}</strong>
		</legend>
		<div class="designs">
			{#each designs as d (d.code)}
				<label class="design" class:checked={d.code === design}>
					<input
						type="radio"
						name="design"
						value={d.code}
						checked={d.code === design}
						onchange={() => pickDesign(d.code)}
					/>
					{#if d.image}
						<img src={d.image} alt="" width="64" height="58" loading="lazy" />
					{:else}
						<span class="swatch" style:background={d.swatch ?? '#ccc'}></span>
					{/if}
					<span>{d.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset id="size-picker" bind:this={sizeFieldset} aria-describedby="size-note{prompted ? ' size-error' : ''}">
		<legend>
			{p.sizeLabel ?? 'Your size'}{#if size}: <strong>{size}</strong>{/if}
		</legend>
		<p class="size-note" id="size-note">
			{p.sizeNote ?? ''}
			{#if p.sizeGuideHref}
				<a href={p.sizeGuideHref}>{p.sizeGuideLabel ?? 'Size guide'}</a>
			{/if}
		</p>
		<div class="sizes">
			{#each sizes as s (s.code)}
				{@const ok = buyable(design, s.code)}
				<label class="size" class:checked={s.code === size} class:off={!ok}>
					<input
						type="radio"
						name="size"
						value={s.code}
						checked={s.code === size}
						disabled={!ok}
						onchange={() => pickSize(s.code)}
					/>
					<span>{s.label}</span>
				</label>
			{/each}
		</div>
		<p class="error" id="size-error" role="alert">
			{#if prompted}{p.sizeMissing ?? 'Pick your size first.'}{/if}
		</p>
	</fieldset>

	<button type="button" class="cta" onclick={add}>
		{p.cta ?? 'Add to cart'}{#if p.price}&nbsp;· {p.price}{/if}
	</button>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.price {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin: 0;
	}
	.amount {
		font-size: 32px;
		line-height: 1.1;
		font-weight: 700;
		color: var(--xmas-red, #b3202a);
	}
	.price .note {
		font-size: 15px;
		color: var(--xmas-pine, #1f5f3f);
		font-weight: 600;
	}
	fieldset {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	legend {
		font-size: 17px;
		margin-bottom: 10px;
		padding: 0;
		color: var(--brand-navy, #0b3c49);
	}
	input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
		pointer-events: none;
	}
	.designs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.design {
		position: relative;
		display: flex;
		align-items: center;
		gap: 10px;
		border: 2px solid var(--line, #d6dfe2);
		border-radius: 16px;
		padding: 8px;
		background: #fff;
		cursor: pointer;
		font-weight: 600;
		font-size: 15px;
		line-height: 1.2;
		color: var(--brand-navy, #0b3c49);
	}
	.design img {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		object-fit: cover;
		flex: none;
	}
	.swatch {
		width: 52px;
		height: 52px;
		border-radius: 10px;
		flex: none;
	}
	.design.checked,
	.size.checked {
		border-color: var(--brand-teal, #14a3b0);
		box-shadow: 0 0 0 2px var(--brand-teal, #14a3b0);
	}
	.design:has(input:focus-visible),
	.size:has(input:focus-visible) {
		outline: 3px solid var(--brand-orange, #ff6b2c);
		outline-offset: 2px;
	}
	.size-note {
		margin: -4px 0 10px;
		font-size: 15px;
		line-height: 1.4;
		color: var(--brand-navy, #0b3c49);
	}
	.size-note a {
		color: var(--brand-navy, #0b3c49);
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		white-space: nowrap;
	}
	.sizes {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.size {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 56px;
		min-height: 48px;
		padding: 0 14px;
		border: 2px solid var(--line, #d6dfe2);
		border-radius: 9999px;
		background: #fff;
		font-weight: 600;
		font-size: 17px;
		color: var(--brand-navy, #0b3c49);
		cursor: pointer;
	}
	.size.off {
		opacity: 0.4;
		text-decoration: line-through;
		cursor: not-allowed;
	}
	.error {
		margin: 8px 0 0;
		min-height: 1px;
		font-size: 15px;
		font-weight: 600;
		color: var(--xmas-red, #b3202a);
	}
	.cta {
		min-height: 56px;
		border: 0;
		border-radius: 9999px;
		background: var(--brand-orange, #ff6b2c);
		color: var(--brand-navy, #0b3c49);
		font: inherit;
		font-size: 19px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 4px 0 #c94a14;
		transition: transform 0.1s ease;
	}
	.cta:active {
		transform: translateY(2px);
		box-shadow: 0 2px 0 #c94a14;
	}
	.cta:focus-visible {
		outline: 3px solid var(--brand-navy, #0b3c49);
		outline-offset: 3px;
	}
	@media (prefers-reduced-motion: reduce) {
		.cta {
			transition: none;
		}
	}
</style>
