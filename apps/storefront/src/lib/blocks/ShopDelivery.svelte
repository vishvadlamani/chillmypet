<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { Block, FlowContext } from '@funnel/core';
	import { countryForm } from '@funnel/blocks-dr/subdivisions';
	import ShopField from '$lib/components/ShopField.svelte';
	import { fieldProblem, type ShopField as FieldName } from '$lib/checkout-fields';
	import { createTranslator, defaultLocale } from '$lib/i18n';

	/**
	 * The shop checkout's Delivery section: country, name, street, town.
	 *
	 * The order the reference uses, which is the order an address is written:
	 * country first, because it decides what the rest are called (State and
	 * ZIP code here, County and Postcode in the UK) and whether a state is
	 * required at all. First and last name are two fields, as on the label the
	 * carrier prints; they also fill `fullName`, which the checkout's draft
	 * capture and InitiateCheckout read. No phone: it is the field people
	 * abandon on, and nothing in this flow uses it.
	 *
	 * Writes into host state as typed, under the same keys the library's
	 * shipping form uses (`country` as the name the select shows, `address`,
	 * `address2`, `city`, `state` as an ISO subdivision code where one exists,
	 * `zip`), so `Checkout.svelte` maps it to the order exactly as it maps the
	 * other checkouts.
	 *
	 * `look: 'classic'` is the classic checkout's drawing: a numbered heading,
	 * labels above the boxes, the apartment behind a link (it is the one
	 * optional line, and most addresses have none), and the town on its own
	 * row with state and ZIP beside each other under it.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			/** Display names, in the order the select lists them. */
			countries?: string[];
			/** ISO codes, same order, lowercased by the markets loader. */
			codes?: string[];
			note?: string;
			look?: string;
			step?: number;
		}
	);
	let classic = $derived(p.look === 'classic');
	// Open from the start when there is already a line 2 to show.
	let apartmentOpen = $state(untrack(() => Boolean(ctx.state.get('address2'))));
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	const get = (field: string) => ctx.state.get(field);
	let country = $derived(get('country'));
	// countryForm knows ISO codes and English names; the select shows names in
	// the page's language, so it is asked by code.
	const codeOf = (name: string) => {
		const i = (p.countries ?? []).indexOf(name);
		return (i >= 0 ? p.codes?.[i] : '')?.toUpperCase() || name;
	};
	let form = $derived(countryForm(codeOf(country)));

	const attemptAtStart = untrack(() => ctx.state.get('checkout_attempt'));
	let attempted = $derived(ctx.state.get('checkout_attempt') !== attemptAtStart);
	let touched = $state<Record<string, boolean>>({});

	function message(field: FieldName, key: string): string {
		const problem = fieldProblem(field, get(key), { stateRequired: form.stateRequired });
		if (!problem || !(attempted || touched[key])) return '';
		// The state and ZIP messages name what this country calls them.
		if (field === 'state') return t(problem, { label: form.stateLabel });
		if (field === 'zip') return t(problem, { label: form.zipLabel });
		return t(problem);
	}

	function set(key: string, value: string) {
		ctx.state.set(key, value);
		if (key === 'firstName' || key === 'lastName') {
			ctx.state.set('fullName', `${get('firstName')} ${get('lastName')}`.trim());
		}
	}

	function setCountry(name: string) {
		const before = form;
		ctx.state.set('country', name);
		// A Texas left behind in a Canadian address is an address nobody can
		// post to; a free-text county can stay, the buyer sees it.
		const after = countryForm(codeOf(name));
		if (before.subdivisions.length > 0 || after.subdivisions.length > 0) ctx.state.set('state', '');
	}

	const blur = (key: string) => () => {
		if (get(key).length > 0) touched[key] = true;
	};
</script>

<section class="shop-section" aria-labelledby="shop-delivery-title">
	<h2 id="shop-delivery-title" class:step={classic}>
		{#if classic && p.step}<span class="step-no" aria-hidden="true">{p.step}</span>{/if}
		{p.heading ?? t('checkout.shippingTitle')}
	</h2>
	<div class="shop-fields">
		<ShopField
			id="shipping-country"
			label={classic ? t('checkout.classic.countryLabel') : t('checkout.country')}
			stacked={classic}
			required
			autocomplete="country-name"
			value={country}
			options={(p.countries ?? []).map((name) => ({ value: name, label: name }))}
			error={message('country', 'country')}
			oninput={setCountry}
		/>
		<div class="shop-row two">
			<ShopField
				id="shipping-firstName"
				label={t('checkout.firstName')}
				stacked={classic}
				required
				placeholder={t('checkout.firstName')}
				autocomplete="given-name"
				value={get('firstName')}
				error={message('firstName', 'firstName')}
				oninput={(v) => set('firstName', v)}
				onblur={blur('firstName')}
			/>
			<ShopField
				id="shipping-lastName"
				label={t('checkout.lastName')}
				stacked={classic}
				required
				placeholder={t('checkout.lastName')}
				autocomplete="family-name"
				value={get('lastName')}
				error={message('lastName', 'lastName')}
				oninput={(v) => set('lastName', v)}
				onblur={blur('lastName')}
			/>
		</div>
		<ShopField
			id="shipping-address"
			label={classic ? t('checkout.classic.streetLabel') : t('checkout.address1')}
			stacked={classic}
			required
			placeholder={t('checkout.classic.streetPlaceholder')}
			autocomplete="address-line1"
			value={get('address')}
			error={message('address', 'address')}
			oninput={(v) => set('address', v)}
			onblur={blur('address')}
		/>
		{#if classic && !apartmentOpen}
			<button type="button" class="classic-more" onclick={() => (apartmentOpen = true)}>
				{t('checkout.classic.addApartment')}
			</button>
		{:else}
			<ShopField
				id="shipping-address2"
				label={classic ? t('checkout.classic.apartment') : t('checkout.address2')}
				stacked={classic}
				autocomplete="address-line2"
				value={get('address2')}
				oninput={(v) => set('address2', v)}
			/>
		{/if}
		<div class="shop-row three" class:split={classic}>
			<ShopField
				id="shipping-city"
				label={t('checkout.city')}
				stacked={classic}
				required
				placeholder={t('checkout.city')}
				autocomplete="address-level2"
				value={get('city')}
				error={message('city', 'city')}
				oninput={(v) => set('city', v)}
				onblur={blur('city')}
			/>
			{#if form.subdivisions.length > 0}
				<ShopField
					id="shipping-state"
					label={form.stateLabel}
					stacked={classic}
					required={form.stateRequired}
					placeholder={t('checkout.classic.selectState', { label: form.stateLabel.toLowerCase() })}
					autocomplete="address-level1"
					value={get('state')}
					options={form.subdivisions.map((s) => ({ value: s.code, label: s.name }))}
					error={message('state', 'state')}
					oninput={(v) => set('state', v)}
				/>
			{:else}
				<ShopField
					id="shipping-state"
					label={form.stateRequired
						? form.stateLabel
						: t('checkout.optionalField', { field: form.stateLabel })}
					stacked={classic}
					required={form.stateRequired}
					placeholder={form.stateLabel}
					autocomplete="address-level1"
					value={get('state')}
					error={message('state', 'state')}
					oninput={(v) => set('state', v)}
					onblur={blur('state')}
				/>
			{/if}
			<ShopField
				id="shipping-zip"
				label={form.zipLabel}
				stacked={classic}
				required
				placeholder={form.zipLabel}
				autocomplete="postal-code"
				value={get('zip')}
				error={message('zip', 'zip')}
				oninput={(v) => set('zip', v)}
				onblur={blur('zip')}
			/>
		</div>
	</div>
	{#if p.note}<p class="shop-note">{p.note}</p>{/if}
</section>
