<script lang="ts">
	import { untrack } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `bundles` — the tier picker that decides average order value.
	 *
	 * One block rather than one per storefront skin. Across the treatments this
	 * was built from, the STRUCTURE never changed — ruled heading, radio tiers
	 * with a struck compare-at, a badge on the tier being pushed, the selected
	 * tier expanding into one variant picker per unit, attached add-ons, one CTA.
	 * What changed was the skin: oval badge or notched ribbon, dark strip or plain
	 * rows, toggle or checkbox. Skins are props; the structure is the block.
	 *
	 * Prices are `$ref` material without exception. This is the block that says
	 * what someone pays, and a literal here is a number that disagrees with the
	 * charge.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Tier = {
		id?: string;
		title?: string;
		/** "You save 40%" / "Keep one, gift one." */
		subtitle?: string;
		price?: string;
		compareAt?: string;
		/** Ribbon copy — "Most Popular", "BEST VALUE". */
		badge?: string;
		image?: string;
		alt?: string;
		/** How many variant pickers appear when this tier is chosen. */
		units?: number;
		/** Choices for each unit. Falls back to the block-level `options`. */
		options?: string[];
		/** "Color", "Superhero", "Flavour". */
		optionLabel?: string;
		selected?: boolean;
	};

	type Addon = {
		id?: string;
		label?: string;
		price?: string;
		compareAt?: string;
		image?: string;
		control?: 'toggle' | 'checkbox';
		/** Pre-ticked. Free add-ons usually are; paid ones are a consent decision. */
		on?: boolean;
		/** Locked on — a bundled gift that isn't optional. */
		fixed?: boolean;
	};

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			tiers?: Tier[];
			addons?: Addon[];
			/** Shared choices when tiers don't bring their own. */
			options?: string[];
			optionLabel?: string;
			cta?: string;
			action?: string;
			accent?: string;
			accentText?: string;
			/** `selected` hangs add-ons off the chosen tier; `below` lists them after. */
			addonPlacement?: 'selected' | 'below';
			/** `invert` is the dark attached strip; `plain` keeps the page surface. */
			addonTone?: 'invert' | 'plain';
			badgeShape?: 'ribbon' | 'pill';
			field?: string;
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
	const accent = $derived(p.accent ?? '#2b6a8f');
	const field = $derived(p.field ?? 'bundle');
	const placement = $derived(p.addonPlacement ?? 'below');

	const tiers = $derived(
		(p.tiers ?? []).filter((t) => t.title).map((t, i) => ({ ...t, id: t.id ?? `tier-${i}` }))
	);
	const addons = $derived(
		(p.addons ?? []).filter((a) => a.label).map((a, i) => ({ ...a, id: a.id ?? `addon-${i}` }))
	);

	let chosen = $state('');
	/** Per-unit variant picks for the chosen tier, e.g. ['Green', 'Green']. */
	let picks = $state<string[]>([]);
	let addonOn = $state<Record<string, boolean>>({});

	const tier = $derived(tiers.find((t) => t.id === chosen));
	const unitOptions = $derived(tier?.options ?? p.options ?? []);
	const unitLabel = $derived(tier?.optionLabel ?? p.optionLabel ?? '');
	const unitCount = $derived(Math.max(0, tier?.units ?? 0));

	/**
	 * Seed once, and write the default back — a pre-checked tier the host doesn't
	 * know about is an order with no bundle on it.
	 */
	$effect(() => {
		untrack(() => {
			if (chosen) return;
			const stored = ctx.state.get(field);
			const valid = tiers.some((t) => t.id === stored);
			const initial = valid ? stored : (tiers.find((t) => t.selected) ?? tiers[0])?.id;
			if (!initial) return;
			chosen = initial;
			if (initial !== stored) ctx.state.set(field, initial);
			for (const a of addons) addonOn[a.id] = a.fixed ? true : Boolean(a.on);
		});
	});

	/**
	 * Variant picks are re-sized to the chosen tier, keeping what still fits.
	 * Moving 3-pack → 2-pack must drop the third choice, not carry it into a
	 * payload for a bundle that has no third unit.
	 */
	$effect(() => {
		const n = unitCount;
		const first = unitOptions[0] ?? '';
		untrack(() => {
			if (picks.length === n) return;
			picks = Array.from({ length: n }, (_, i) => picks[i] ?? first);
		});
	});

	function choose(id: string) {
		chosen = id;
		ctx.state.set(field, id);
		const t = tiers.find((x) => x.id === id);
		ctx.track('bundle_selected', { bundle: id, price: t?.price });
	}

	function addToCart() {
		const selected = addons.filter((a) => addonOn[a.id]).map((a) => a.id);
		ctx.submit(p.action ?? 'add_to_cart', {
			bundle: chosen,
			title: tier?.title,
			price: tier?.price,
			units: unitCount,
			variants: picks.slice(0, unitCount),
			addons: selected,
			source: 'bundles'
		});
		ctx.track('add_to_cart_click', { source: 'bundles', bundle: chosen });
	}

	const BADGE = $derived(
		p.badgeShape === 'pill' ? 'rounded-pill px-3 py-1' : 'rounded-[6px] px-3 py-1'
	);
</script>

{#if tiers.length}
	<section class="mx-auto flex w-full {widthClass} flex-col gap-4 px-gutter">
		{#if p.heading}
			<!-- Rules either side, which is what makes it read as a section break
			     rather than another heading in the stack. aria-hidden on the lines so
			     a screen reader gets the words and not two empty spans. -->
			<div class="flex items-center gap-3">
				<span class="h-px flex-1 bg-[#d8d5cf]" aria-hidden="true"></span>
				<h2 id="{block.id}-label" class="text-13 tracking-label text-fx-ink font-bold uppercase">
					{p.heading}
				</h2>
				<span class="h-px flex-1 bg-[#d8d5cf]" aria-hidden="true"></span>
			</div>
		{/if}

		<div
			class="flex flex-col gap-3"
			role="radiogroup"
			aria-labelledby={p.heading ? `${block.id}-label` : undefined}
			aria-label={p.heading ? undefined : 'Bundle'}
		>
			{#each tiers as t (t.id)}
				{@const active = t.id === chosen}
				<!-- pt-3 on the wrapper reserves the badge's overhang. Without it the
				     ribbon is clipped by the previous card or the section edge. -->
				<div class="relative {t.badge ? 'pt-3' : ''}">
					{#if t.badge}
						<span
							class="{BADGE} text-11 tracking-label absolute -top-0 right-3 z-10 font-bold uppercase"
							style:background={accent}
							style:color={p.accentText ?? '#ffffff'}
						>
							{t.badge}
						</span>
					{/if}

					<div
						class="overflow-hidden rounded-panel border-2 transition-colors"
						style:border-color={active ? accent : '#e2e0dc'}
						style:background={active ? '#ffffff' : '#fafaf9'}
					>
						<label class="flex cursor-pointer items-center gap-3 px-4 py-4">
							<input
								type="radio"
								name="{block.id}-bundle"
								value={t.id}
								checked={active}
								onchange={() => choose(t.id)}
								class="size-5 shrink-0"
								style:accent-color={accent}
							/>

							{#if t.image}
								<img
									src={t.image}
									alt={t.alt ?? ''}
									class="rounded-field size-14 shrink-0 object-cover"
									loading="lazy"
								/>
							{/if}

							<span class="min-w-0 flex-1">
								<span class="text-17 text-fx-ink block font-bold">{t.title}</span>
								{#if t.subtitle}
									<span class="text-15 text-fx-sub block">{t.subtitle}</span>
								{/if}
							</span>

							<span class="shrink-0 text-right">
								{#if t.price}
									<span class="text-21 text-fx-ink block font-bold tabular-nums">{t.price}</span>
								{/if}
								{#if t.compareAt}
									<span class="text-15 text-fx-muted block line-through tabular-nums"
										>{t.compareAt}</span
									>
								{/if}
							</span>
						</label>

						<!-- Variant pickers only on the chosen tier. Rendering them on every
						     tier asks someone to configure bundles they aren't buying. -->
						{#if active && unitCount > 0 && unitOptions.length}
							<div class="flex flex-col gap-2 px-4 pb-4">
								{#if unitLabel}
									<span class="text-15 text-fx-sub">{unitLabel}</span>
								{/if}
								{#each Array(unitCount) as _, i (i)}
									<div class="flex items-center gap-3">
										<label class="text-15 text-fx-sub w-8 shrink-0" for="{block.id}-unit-{i}">
											#{i + 1}
										</label>
										<select
											id="{block.id}-unit-{i}"
											class="rounded-field text-15 text-fx-ink min-w-0 flex-1 border border-[#d8d5cf] bg-white px-3 py-2"
											value={picks[i] ?? unitOptions[0]}
											onchange={(e) => {
												picks[i] = e.currentTarget.value;
												ctx.track('bundle_variant', { unit: i + 1, value: picks[i] });
											}}
										>
											{#each unitOptions as o (o)}
												<option value={o}>{o}</option>
											{/each}
										</select>
									</div>
								{/each}
							</div>
						{/if}

						{#if placement === 'selected' && active && addons.length}
							{@render addonRows()}
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if placement === 'below' && addons.length}
			<div class="rounded-panel overflow-hidden border border-[#e2e0dc]">
				{@render addonRows()}
			</div>
		{/if}

		<button
			type="button"
			onclick={addToCart}
			class="rounded-field text-17 w-full px-5 py-4 font-bold tracking-headline transition-opacity hover:opacity-90"
			style:background={accent}
			style:color={p.accentText ?? '#ffffff'}
		>
			{p.cta ?? 'Add to cart'}
		</button>
	</section>
{/if}

{#snippet addonRows()}
	{@const invert = (p.addonTone ?? 'plain') === 'invert'}
	<div class={invert ? 'bg-[#111111] text-white' : 'bg-white'}>
		{#each addons as a (a.id)}
			<label
				class="flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 {invert
					? 'border-white/15'
					: 'border-[#e2e0dc]'} {a.fixed ? 'cursor-default' : ''}"
			>
				<input
					type="checkbox"
					checked={addonOn[a.id] ?? false}
					disabled={a.fixed}
					onchange={(e) => {
						addonOn[a.id] = e.currentTarget.checked;
						ctx.track('addon_toggled', { addon: a.id, on: addonOn[a.id] });
					}}
					class="size-5 shrink-0 {a.control === 'toggle' ? 'sr-only peer' : ''}"
					style:accent-color={accent}
				/>

				{#if a.control === 'toggle'}
					<!-- Track + knob driven off `peer-checked`, so the native checkbox
					     stays the control and keeps its keyboard and label behaviour. -->
					<span
						class="relative h-6 w-11 shrink-0 rounded-pill bg-[#c9c7c2] transition-colors peer-checked:bg-[var(--on)] after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-pill after:bg-white after:transition-transform peer-checked:after:translate-x-5"
						style="--on: {accent}"
						aria-hidden="true"
					></span>
				{/if}

				{#if a.image}
					<img
						src={a.image}
						alt=""
						class="rounded-field size-10 shrink-0 object-cover"
						loading="lazy"
					/>
				{/if}

				<span class="text-15 min-w-0 flex-1 font-bold">{a.label}</span>

				<span class="shrink-0 text-right">
					{#if a.price}
						<span class="text-15 block font-bold tabular-nums">{a.price}</span>
					{/if}
					{#if a.compareAt}
						<span
							class="text-13 block line-through tabular-nums {invert
								? 'text-white/60'
								: 'text-fx-muted'}">{a.compareAt}</span
						>
					{/if}
				</span>
			</label>
		{/each}
	</div>
{/snippet}
