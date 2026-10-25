<script lang="ts">
	import { onMount } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from '@funnel/blocks-dr/tokens';
	import { resized } from '$lib/resized';

	/**
	 * Design, then size, then one button.
	 *
	 * The block states what was chosen and stops. Option CODES go out through
	 * `submit`, never a variant id or a URL: which variant that pair is, and
	 * where the buyer goes next, are the host's business.
	 *
	 * The size starts empty on purpose. It is the wearer's size, and only the
	 * wearer knows it; a default would quietly ship every order in S.
	 *
	 * `look: 'pills'` is the quieter storefront layout (the costume page): colour
	 * and size as pills side by side, optional bundle cards and one
	 * full-width button. `ctaBeforeTiers` puts that button before the upsell. `tiers` are the host's quantity breaks, priced by the
	 * server; the chosen tier's id goes into `tierField` so the sticky bar can
	 * show and buy the same thing, and its unit count goes out with the add.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Design = { code: string; label: string; swatch?: string; image?: string };
	type Size = { code: string; label: string };
	type Tier = { id: string; title?: string; subtitle?: string; price?: string; image?: string; units?: number };
	type TierCopy = { units: number; title?: string; tag?: string; sub?: string; ribbon?: string };

	const p = $derived(
		(block.props ?? {}) as {
			designs?: Design[];
			sizes?: Size[];
			/** `design:size` pairs that can be bought. Anything else is greyed out. */
			available?: string[];
			price?: string;
			priceNote?: string;
			/** One line under the price, saying what this is for. `**bold**` is honoured. */
			tagline?: string;
			designLabel?: string;
			sizeLabel?: string;
			sizeNote?: string;
			sizeGuideHref?: string;
			sizeGuideLabel?: string;
			sizeMissing?: string;
			cta?: string;
			look?: 'cards' | 'pills';
			tiers?: Tier[];
			tierField?: string;
			/** Words for each tier, matched on `units`. Prices always come from `tiers`. */
			tierCopy?: TierCopy[];
			tiersTitle?: string;
			/** Let a single-item buyer reach checkout before the optional quantity breaks. */
			ctaBeforeTiers?: boolean;
			/** What a unit is called on a tier's saving line: "You save 7% with 2 hoodies". */
			unitsNoun?: string;
			/** Small print under the button. */
			ctaNote?: string;
			/**
			 * False on the one-page checkout, where the host fills the cart from
			 * the choice itself and the only button on the page is the one that
			 * pays. Two buttons there would ask the buyer which one to press.
			 */
			button?: boolean;
			/**
			 * Shrink to one line ("Green · Size M", Change) once both are
			 * chosen. The shop checkout sets it: a buyer who chose on the landing
			 * page arrives with both, and the full picker above the email field
			 * pushed the form a screen down to restate a choice already made.
			 * Change opens it again; a buyer who arrives without a size sees the
			 * whole picker, since there is nothing to fold yet.
			 */
			fold?: boolean;
			changeLabel?: string;
		}
	);
	const pills = $derived(p.look === 'pills');
	const tiers = $derived((p.tiers ?? []).filter((t) => t.id));
	const tierField = $derived(p.tierField ?? 'bundle');
	const tier = $derived(tiers.find((t) => t.id === ctx.state.get(tierField)) ?? tiers[0] ?? null);
	const units = $derived(Math.max(1, tier?.units ?? 1));
	const copyFor = (t: Tier) => p.tierCopy?.find((c) => c.units === (t.units ?? 1));

	const designs = $derived(p.designs ?? []);
	const sizes = $derived(p.sizes ?? []);
	const available = $derived(new Set(p.available ?? []));

	const design = $derived(
		designs.find((d) => d.code === ctx.state.get('design'))?.code ?? designs[0]?.code ?? ''
	);
	// One size (the massager) is nothing to choose: it reads as chosen and
	// gets no buttons. The hosts read it the same way (`oneSize` in their data).
	const oneSize = $derived(sizes.length === 1 ? sizes[0].code : '');
	const size = $derived(
		sizes.some((s) => s.code === ctx.state.get('size')) ? ctx.state.get('size') : oneSize
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

	function pickTier(id: string) {
		ctx.state.set(tierField, id);
		ctx.track('bundle_selected', { bundle: id });
	}

	function add() {
		ctx.submit('add_to_cart', { design, size, units, bundle: tier?.id, source: 'picker' });
		ctx.track('add_to_cart_click', { source: 'picker', design, size, units });
	}

	const designName = $derived(designs.find((d) => d.code === design)?.label ?? '');
	const designImage = $derived(designs.find((d) => d.code === design)?.image);
	// Opened by Change, and kept open for the rest of the visit: folding again
	// the moment a size is tapped would move the page under the buyer's finger.
	let unfolded = $state(false);
	// Either look folds: the line is the same whichever layout it opens to.
	const folded = $derived(Boolean(p.fold) && !unfolded && Boolean(size) && buyable(design, size));

	function unfold() {
		unfolded = true;
		// The button that had focus is gone; hand it to the chosen size, where
		// the buyer most likely wants to be.
		requestAnimationFrame(() =>
			sizeFieldset?.querySelector<HTMLInputElement>('input:checked, input:not(:disabled)')?.focus()
		);
	}
</script>

{#snippet rich(text: string)}
	{#each emphasize(text) as span, i (i)}
		{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
	{/each}
{/snippet}

{#snippet purchaseButton()}
	{#if p.button !== false}
		<button type="button" class="cta" onclick={add}>
			<span>{p.cta ?? 'Add to cart'}</span>
			{#if tier?.price ?? p.price}<span>{tier?.price ?? p.price}</span>{/if}
		</button>
		{#if p.ctaNote}<p class="fine center">{p.ctaNote}</p>{/if}
	{/if}
{/snippet}

{#if pills && !folded}
<div class="picker pills" id="variant-picker">
	{#if p.price}
		<p class="price">
			<span class="amount">{p.price}</span>
			{#if p.priceNote}<span class="chip">{p.priceNote}</span>{/if}
		</p>
	{/if}
	{#if p.tagline}<p class="tagline">{@render rich(p.tagline)}</p>{/if}

	<div class="options" class:single={designs.length === 1} class:no-sizes={Boolean(oneSize)}>
		<fieldset>
			<legend>{p.designLabel ?? 'Design'}</legend>
			<div class="pill-row">
				{#each designs as d (d.code)}
					<label class="pill" class:checked={d.code === design}>
						<input
							type="radio"
							name="design"
							value={d.code}
							checked={d.code === design}
							onchange={() => pickDesign(d.code)}
						/>
						<i class="dot" style:background={d.swatch ?? '#ccc'}></i>
						<span>{d.label}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if !oneSize}
		<fieldset
			id="size-picker"
			bind:this={sizeFieldset}
			aria-describedby="size-note{prompted ? ' size-error' : ''}"
		>
			<legend class="split">
				<span>{p.sizeLabel ?? 'Size'}{#if size}: <strong>{size}</strong>{/if}</span>
				{#if p.sizeGuideHref}
					<a class="guide-link" href={p.sizeGuideHref}>{p.sizeGuideLabel ?? 'Size guide'} ↗</a>
				{/if}
			</legend>
			<div class="pill-row">
				{#each sizes as s (s.code)}
					{@const ok = buyable(design, s.code)}
					<label class="pill" class:checked={s.code === size} class:off={!ok}>
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
		</fieldset>
		{/if}
	</div>
	<p class="fine" id="size-note">{p.sizeNote ?? ''}</p>
	<p class="error" id="size-error" role="alert">
		{#if prompted}{p.sizeMissing ?? 'Pick your size first.'}{/if}
	</p>

	{#if p.ctaBeforeTiers}{@render purchaseButton()}{/if}

	{#if tiers.length > 1}
		<fieldset class="tiers">
			<legend class="tiers-title"><span>{p.tiersTitle ?? 'Choose your bundle'}</span></legend>
			{#each tiers as t (t.id)}
				{@const words = copyFor(t)}
				<label class="tier" class:checked={t.id === tier?.id}>
					<input
						type="radio"
						name="tier"
						value={t.id}
						checked={t.id === tier?.id}
						onchange={() => pickTier(t.id)}
					/>
					{#if words?.ribbon}<span class="ribbon">{words.ribbon}</span>{/if}
					<span class="tier-main">
						{#if t.image}<img src={resized(t.image, 200)} alt="" width="40" height="48" loading="lazy" />{/if}
						<span class="tier-text">
							<strong>{words?.title ?? t.title}</strong>
							{#if words?.tag}<em>{words.tag}</em>{/if}
							{#if words?.sub}<small>{words.sub}</small>{/if}
						</span>
						<b class="tier-price">{t.price}</b>
					</span>
					{#if t.subtitle}<span class="saving">♥ {t.subtitle} with {t.units} {p.unitsNoun ?? 'items'}</span>{/if}
				</label>
			{/each}
		</fieldset>
	{/if}

	{#if !p.ctaBeforeTiers}{@render purchaseButton()}{/if}
</div>
{:else if folded}
<div class="picker folded" id="variant-picker">
	<div class="chosen">
		{#if designImage}
			<img src={resized(designImage, 200)} alt="" width="48" height="48" />
		{/if}
		<p>
			<strong>{designName}</strong>
			<span>{oneSize ? oneSize : `${p.sizeLabel ?? 'Size'}: ${size}`}{units > 1 ? ` · ${units} ${p.unitsNoun ?? 'items'}` : ''}</span>
		</p>
		<button type="button" onclick={unfold}>
			{p.changeLabel ?? 'Change'}
		</button>
	</div>
</div>
{:else}
<div class="picker" id="variant-picker">
	{#if p.price}
		<p class="price">
			<span class="amount">{p.price}</span>
			{#if p.priceNote}<span class="note">{p.priceNote}</span>{/if}
		</p>
	{/if}
	{#if p.tagline}
		<p class="tagline">
			{#each emphasize(p.tagline) as span, i (i)}
				{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
			{/each}
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
						<img src={resized(d.image, 200)} alt="" width="64" height="58" loading="lazy" />
					{:else}
						<span class="swatch" style:background={d.swatch ?? '#ccc'}></span>
					{/if}
					<span>{d.label}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if !oneSize}
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
	{/if}

	{#if p.button !== false}
		<button type="button" class="cta" onclick={add}>
			{p.cta ?? 'Add to cart'}{#if p.price}&nbsp;· {p.price}{/if}
		</button>
	{/if}
</div>
{/if}

<style>
	.chosen {
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid var(--line, #d6dfe2);
		border-radius: 12px;
		padding: 10px 12px;
		background: #fff;
	}
	.chosen img {
		width: 48px;
		height: 48px;
		flex: none;
		border-radius: 8px;
		object-fit: cover;
	}
	.chosen p {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;
		margin: 0;
		font-size: 16px;
		line-height: 1.3;
		color: var(--brand-navy, #0b3c49);
	}
	.chosen button {
		min-height: 44px;
		padding: 0 6px;
		border: 0;
		background: none;
		font: inherit;
		font-size: 16px;
		color: var(--brand-teal, #14a3b0);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.picker {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	/*
	 * On a phone the tagline waits below the sizes: it is the one line in the
	 * buy box that isn't the price or a choice, and above them it was what
	 * pushed the size buttons off the first screen.
	 */
	@media (max-width: 767px) {
		.pills .tagline {
			order: 1;
		}
		.pills .tiers,
		.pills .cta,
		.pills .fine.center {
			order: 2;
		}
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
	/* Tucked under the price: the two read as one statement. */
	.tagline {
		margin: -12px 0 0;
		font-size: 17px;
		line-height: 1.4;
		color: var(--brand-navy, #0b3c49);
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
	/* ---- look: 'pills' ------------------------------------------------- */
	.pills {
		gap: 16px;
		--g: var(--tree-green, #285b43);
		--ink: var(--tree-ink, #243b31);
		color: var(--ink);
	}
	.pills .amount {
		font-size: 28px;
		line-height: 28px;
		letter-spacing: 1px;
		color: var(--g);
	}
	.pills .chip {
		align-self: center;
		border-radius: 4px;
		background: var(--g);
		color: #fff;
		padding: 4px 8px;
		font-size: 11px;
		line-height: 1.6;
		font-weight: 700;
		letter-spacing: 0.9px;
		text-transform: uppercase;
	}
	.pills .tagline {
		margin: -4px 0 0;
		font-size: 16px;
		line-height: 25.6px;
		color: var(--ink);
	}
	.pills .options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	/* One colour is one pill: give the sizes the rest of the row, or a fourth
	   size (the reindeer hoodie's XL) wraps onto a line of its own. */
	.pills .options.single {
		grid-template-columns: auto minmax(0, 1fr);
	}
	/* One size has no column of its own: the colours take the whole row,
	   or on a phone they stack in half of it. */
	.pills .options.no-sizes {
		grid-template-columns: minmax(0, 1fr);
	}
	.pills fieldset {
		position: relative;
	}
	.pills legend {
		margin-bottom: 8px;
		padding: 0 2px;
		font-size: 13px;
		line-height: 20.8px;
		font-weight: 700;
		color: var(--ink);
	}
	.pills legend.split {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		width: 100%;
	}
	.pills .guide-link {
		font-weight: 400;
		white-space: nowrap;
		font-size: 12px;
		line-height: 20.8px;
		color: var(--ink);
		text-decoration: none;
	}
	.pills .guide-link:hover {
		text-decoration: underline;
	}
	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pill {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 8px 18px;
		border: 1px solid var(--tree-line, #c7cec2);
		border-radius: 24px;
		background: var(--tree-card, #fffdf9);
		font-size: 13px;
		line-height: 20.8px;
		cursor: pointer;
		color: var(--ink);
	}
	.pill.checked {
		border-color: var(--g);
		background: var(--g);
		color: #fff;
	}
	.pill.off {
		opacity: 0.4;
		text-decoration: line-through;
		cursor: not-allowed;
	}
	.pill:has(input:focus-visible) {
		outline: 2px solid var(--g);
		outline-offset: 2px;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.7);
	}
	.pills .fine {
		margin: -4px 0 0;
		font-size: 11px;
		line-height: 16.5px;
		color: var(--tree-muted, #637168);
	}
	.pills .fine.center {
		margin: 0;
		text-align: center;
	}
	.pills .error {
		margin: -10px 0 0;
		min-height: 0;
	}
	.pills .error:empty {
		display: none;
	}
	.tiers {
		display: grid;
		gap: 16px;
		margin-top: 4px;
	}
	.tiers-title {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		margin: 0 0 6px;
		font-size: 14px;
		line-height: 17.5px;
		font-weight: 800;
		letter-spacing: 0.6px;
		text-transform: uppercase;
		color: var(--tree-green-deep, #194b36);
	}
	.tiers-title::before,
	.tiers-title::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--ink);
	}
	.tier {
		position: relative;
		display: block;
		border: 2px solid #c9d0c8;
		border-radius: 10px;
		background: var(--tree-card, #fffdf9);
		cursor: pointer;
	}
	.tier.checked {
		border-color: var(--g);
		background: var(--tree-tint, #edf2eb);
	}
	.tier:has(input:focus-visible) {
		outline: 2px solid var(--g);
		outline-offset: 2px;
	}
	.tier .ribbon {
		position: absolute;
		top: -12px;
		right: 12px;
		border-radius: 4px;
		background: var(--tree-ribbon, #a32938);
		color: #fff;
		padding: 5px 10px;
		font-size: 11px;
		line-height: 14.3px;
		font-weight: 700;
		letter-spacing: 0;
	}
	.tier-main {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 22px 14px 16px;
	}
	.tier-main img {
		width: 40px;
		height: 48px;
		border-radius: 6px;
		object-fit: cover;
		flex: none;
	}
	.tier-text {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
	}
	.tier-text strong {
		font-size: 15px;
		line-height: 17.25px;
		letter-spacing: 0;
		color: #20221e;
	}
	.tier-text em {
		border-radius: 4px;
		background: var(--tree-chip, #f0e3c4);
		color: var(--tree-chip-ink, #54401c);
		padding: 4px 7px;
		font-size: 10px;
		line-height: 12px;
		font-style: normal;
	}
	.tier-text small {
		font-size: 10px;
		line-height: 14.5px;
		color: #55554e;
	}
	.tier-price {
		font-size: 20px;
		line-height: 22px;
		letter-spacing: 0;
		color: var(--g);
	}
	.saving {
		display: block;
		border-radius: 0 0 8px 8px;
		background: var(--tree-saving, #f3ead6);
		color: var(--g);
		padding: 8px 16px;
		font-size: 12px;
		line-height: 14.4px;
		font-weight: 600;
	}
	.pills .cta {
		display: flex;
		justify-content: center;
		gap: 22px;
		width: 100%;
		margin-top: 4px;
		border: 0;
		border-radius: 28px;
		background: var(--g);
		color: #fff;
		padding: 17px 24px;
		font-size: 17px;
		line-height: 27.2px;
		font-weight: 700;
		letter-spacing: 1px;
		text-transform: uppercase;
		box-shadow: none;
	}
	.pills .cta:hover {
		background: var(--tree-green-deep, #194b36);
	}
</style>
