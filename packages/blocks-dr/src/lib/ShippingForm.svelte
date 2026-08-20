<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import AddressLookup from './AddressLookup.svelte';
	import type { ResolvedAddress } from './address';
	import { toSubdivisionCode } from './subdivisions';
	import FieldGroup from './FieldGroup.svelte';
	import { resolveFields, type Field, type FieldName } from './fields';

	/**
	 * `shipping_form` — where the order goes.
	 *
	 * Defaults to the Stripe/Apple address set and order exactly: country first
	 * (it determines what the rest of the fields even mean), then two address
	 * lines, then City|ZIP on one row, then State.
	 *
	 * Name and email live in `contact_form`. Safe to drive from a manifest in a
	 * way `payment` is not — plain fields, no third-party lifecycle — and field
	 * order here is a real conversion decision worth testing as data.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			heading?: string;
			fields?: (FieldName | Field)[];
			variant?: 'grouped' | 'stacked';
			countries?: string[];
			submitLabel?: string;
			action?: string;
			note?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
			/**
			 * Start as ONE search field and expand into the full set once an address
			 * is chosen. Omit for the plain six-field form.
			 *
			 * Typing a full address is the heaviest thing a checkout asks of anyone
			 * on a phone, and it's where carts die. One field instead of six is the
			 * biggest mobile conversion lever in this block.
			 */
			lookup?: {
				/** Host route that proxies the provider. */
				endpoint?: string;
				/** Bias results to these ISO country codes, e.g. ['ca','us']. */
				countries?: string[];
				label?: string;
				placeholder?: string;
				manualLabel?: string;
			};
		}
	);

	const DEFAULT: FieldName[] = ['country', 'address', 'address2', 'city', 'zip', 'state'];
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const fields = $derived(resolveFields(p.fields, DEFAULT));

	// Expanded once an address is chosen — or from the start when no lookup is
	// configured, which is the plain form.
	let expanded = $state(false);
	const searching = $derived(Boolean(p.lookup) && !expanded);

	/**
	 * Host state is written BEFORE the field group mounts. `FieldGroup` seeds its
	 * inputs from `ctx.state` once, untracked, so anything landing after it mounts
	 * would never appear — filling first is what makes the expansion show the
	 * address instead of six empty boxes.
	 */
	function expandWith(values: Partial<ResolvedAddress>) {
		for (const [key, value] of Object.entries(values)) {
			if (!value) continue;
			// Normalised HERE, on the way into host state — not just for display.
			// The provider returns "British Columbia"; carriers and tax engines want
			// `BC`. Fixing it only in the select would leave the submitted payload
			// carrying the display name, which is the failure the codes exist to
			// prevent and the one nobody sees until an order ships wrong.
			const next = key === 'state' ? toSubdivisionCode(values.country, String(value)) : String(value);
			ctx.state.set(key, next);
		}
		expanded = true;
	}

	function onresolve(a: ResolvedAddress) {
		expandWith(a);
		ctx.track('address_autocompleted', { country: a.country });
	}

	function onmanual(typed: string) {
		// Keep whatever they'd typed — retyping it into line one is the fastest way
		// to lose someone who already gave up on the suggestions.
		expandWith({ address: typed });
		ctx.track('address_manual');
	}
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	{#if p.lookup && searching}
		<div class="flex flex-col gap-4">
			{#if p.heading}
				<h2 class="text-21 tracking-headline text-fx-ink font-bold">{p.heading}</h2>
			{/if}
			<AddressLookup
				id="{block.id}-lookup"
				label={p.lookup.label ?? 'Address'}
				placeholder={p.lookup.placeholder ?? 'Start typing your address'}
				endpoint={p.lookup.endpoint ?? '/api/address'}
				countries={p.lookup.countries ?? []}
				manualLabel={p.lookup.manualLabel ?? 'Enter address manually'}
				{onresolve}
				{onmanual}
			/>
		</div>
	{:else}
		<FieldGroup
			id={block.id}
			{ctx}
			{fields}
			heading={p.heading}
			variant={p.variant}
			countries={p.countries}
			submitLabel={p.submitLabel}
			action={p.action ?? 'shipping'}
			note={p.note}
		/>
	{/if}
</section>
