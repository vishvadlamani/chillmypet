<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { Block, FlowContext } from '@funnel/core';
	import { createTranslator, defaultLocale } from '$lib/i18n';

	/**
	 * The shop checkout's Shipping method: one bordered list, a radio per rate,
	 * its time under its name and its price on the right.
	 *
	 * The reference keeps this empty until an address is typed, because its
	 * rates depend on where the parcel goes. Ours don't (`SHIPPING_RATES` is
	 * the same everywhere), so they show from the start and the buyer can
	 * see delivery is free before typing anything. The rates are the ones the
	 * order is priced against, bound from `shipping.rates`; the Christmas
	 * cut-off is the same config value the product page's strip reads, and
	 * drops out on its own once the date has passed.
	 *
	 * `look: 'classic'` numbers it as a step and puts the three stages of a
	 * delivery above the rates, so "Estimated arrival" reads as the last one.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Rate = { id: string; label: string; detail?: string; price: string; selected?: boolean };
	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			options?: Rate[];
			field?: string;
			note?: string;
			look?: string;
			step?: number;
		}
	);
	let classic = $derived(p.look === 'classic');
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));
	const field = $derived(p.field ?? 'shippingMethod');
	const options = $derived(p.options ?? []);
	let chosen = $derived(
		options.find((o) => o.id === ctx.state.get(field))?.id ??
			options.find((o) => o.selected)?.id ??
			options[0]?.id ??
			''
	);

	// The checkout follows what this block chose, so the default has to be
	// written, not just shown.
	onMount(() => {
		if (chosen && ctx.state.get(field) !== chosen) ctx.state.set(field, chosen);
	});

	function choose(id: string) {
		ctx.state.set(field, id);
		ctx.track('shipping_method_selected', { method: id });
	}
</script>

<section class="shop-section" aria-labelledby="shop-method-title">
	<h2 id="shop-method-title" class:small={!classic} class:step={classic}>
		{#if classic && p.step}<span class="step-no" aria-hidden="true">{p.step}</span>{/if}
		{p.heading ?? t('checkout.methodTitle')}
	</h2>
	{#if classic}
		<ol class="classic-timeline" aria-label={p.heading ?? t('checkout.methodTitle')}>
			<li>{t('checkout.classic.placed')}</li>
			<li>{t('checkout.classic.tracking')}</li>
			<li>{t('checkout.classic.delivered')}</li>
		</ol>
	{/if}
	<fieldset class="shop-choices">
		<legend class="sr-only">{p.heading ?? t('checkout.methodTitle')}</legend>
		{#each options as option (option.id)}
			<label class="shop-choice" class:checked={option.id === chosen}>
				<input
					type="radio"
					name="shop-method"
					value={option.id}
					checked={option.id === chosen}
					onchange={() => choose(option.id)}
				/>
				<span class="text">
					<span>{option.label}</span>
					{#if option.detail}<small>{option.detail}</small>{/if}
				</span>
				<strong>{option.price}</strong>
			</label>
		{/each}
	</fieldset>
	{#if p.note}<p class="shop-note">{p.note}</p>{/if}
</section>
