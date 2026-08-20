<script lang="ts">
	import { untrack } from 'svelte';
	import type { FlowContext } from '@funnel/core';
	import type { Field } from './fields';
	import { countryForm, toSubdivisionCode } from './subdivisions';

	/**
	 * Shared form renderer behind `contact_form` and `shipping_form`.
	 *
	 * Not a block — it takes plain props, so it never appears in a manifest. It
	 * exists so the two blocks share one implementation of validation, state
	 * binding and the grouped/stacked treatments instead of drifting apart.
	 */
	let {
		id,
		ctx,
		fields,
		heading,
		variant = 'grouped',
		submitLabel,
		action = 'form',
		note,
		countries
	}: {
		id: string;
		ctx: FlowContext;
		fields: Field[];
		heading?: string;
		/** `grouped` is the Stripe/Apple fieldset; `stacked` labels each input. */
		variant?: 'grouped' | 'stacked';
		/** Omit to render no button — useful when a later block submits for both. */
		submitLabel?: string;
		action?: string;
		note?: string;
		countries?: string[];
	} = $props();

	const grouped = $derived(variant !== 'stacked');

	// Seeded once from host state — untracked so a later write doesn't yank what
	// someone is mid-way through typing.
	const values = $state<Record<string, string>>({});
	$effect(() => {
		untrack(() => {
			for (const f of fields) if (values[f.name] === undefined) values[f.name] = ctx.state.get(f.name);
			// The seeded subdivision may be a full name — an autocompleted address
			// arrives as "British Columbia" while the options are keyed `BC`. Left
			// alone the select matches nothing and renders blank.
			//
			// Written back to host state, not just fixed locally: state seeded from
			// an older session, or from any host that stored a display name, would
			// otherwise keep that name in the submitted payload while showing the
			// code on screen.
			if (values.state) {
				const code = toSubdivisionCode(values.country, values.state);
				if (code !== values.state) {
					values.state = code;
					ctx.state.set('state', code);
				}
			}
		});
	});

	/**
	 * The subdivision field follows the country: a select where a canonical list
	 * exists, plain text where one doesn't, and its label changes with it —
	 * "Province" in Canada, "County" in the UK, "State" in the US.
	 */
	const form = $derived(countryForm(values.country));

	function labelFor(f: Field): string {
		if (f.name === 'state') return form.stateLabel;
		if (f.name === 'zip') return form.zipLabel;
		return f.label ?? f.name;
	}

	/** Required-ness is per country too — a UK address posts fine with no county. */
	function requiredFor(f: Field): boolean {
		if (f.name === 'state') return form.stateRequired;
		return Boolean(f.required);
	}

	let showErrors = $state(false);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	function errorFor(f: Field): string {
		const v = (values[f.name] ?? '').trim();
		if (requiredFor(f) && !v) return `${labelFor(f)} is required`;
		if (f.type === 'email' && v && !EMAIL.test(v)) return 'Enter a valid email address';
		return '';
	}
	const errors = $derived(Object.fromEntries(fields.map((f) => [f.name, errorFor(f)])));
	const valid = $derived(Object.values(errors).every((e) => !e));

	/** Consecutive `half` fields share a row — so pairing is a manifest decision. */
	const rows = $derived.by(() => {
		const out: Field[][] = [];
		for (let i = 0; i < fields.length; ) {
			const f = fields[i];
			if (f.half && fields[i + 1]?.half) {
				out.push([f, fields[i + 1]]);
				i += 2;
			} else {
				out.push([f]);
				i += 1;
			}
		}
		return out;
	});

	/** Code/name pairs for the subdivision select, or null for a text input. */
	function subdivisionsFor(f: Field) {
		return f.name === 'state' && form.subdivisions.length ? form.subdivisions : null;
	}

	const isSelect = (f: Field) =>
		Boolean(f.options?.length || subdivisionsFor(f) || (f.name === 'country' && countries?.length));

	function update(name: string, v: string) {
		values[name] = v;
		ctx.state.set(name, v.trim());

		// Changing country invalidates the subdivision. "CA" means California in
		// the US list and nothing in Canada's; carrying it over silently ships an
		// order to a province that doesn't exist. Re-map where the name survives
		// the move, otherwise clear it and make someone choose again.
		if (name === 'country') {
			const mapped = toSubdivisionCode(v, values.state);
			const valid =
				!countryForm(v).subdivisions.length ||
				countryForm(v).subdivisions.some((s) => s.code === mapped);
			const next = valid ? mapped : '';
			values.state = next;
			ctx.state.set('state', next);
		}
	}

	function submit(e: Event) {
		e.preventDefault();
		showErrors = true;
		if (!valid) {
			ctx.track(`${action}_invalid`, {
				fields: Object.entries(errors)
					.filter(([, m]) => m)
					.map(([k]) => k)
			});
			return;
		}
		ctx.submit(action, { ...values });
		ctx.track(`${action}_submit`);
	}

	const STACKED =
		'rounded-field border border-[#d8d5cf] bg-white px-4 py-3 text-15 text-fx-ink placeholder:text-fx-muted focus:border-fx-ink focus:outline-none w-full';
	const GROUPED =
		'cell w-full border-0 bg-transparent px-4 py-3 text-15 text-fx-ink placeholder:text-fx-muted';

	/**
	 * The four outer controls carry the container's corner radius.
	 *
	 * Without it the focus outline is a square rectangle inside a rounded,
	 * overflow-hidden box, so the container clips its corners flat and the ring
	 * looks broken exactly where it's most visible. An outline follows its own
	 * element's radius, so the radius has to be on the control.
	 *
	 * Written as utilities rather than `var(--radius-field)` — Tailwind inlines
	 * theme values into utilities instead of emitting the variables, so a raw
	 * var() here resolves to nothing.
	 */
	function corners(r: number, c: number, cells: number): string {
		const first = r === 0;
		const last = r === rows.length - 1;
		const left = c === 0;
		const right = c === cells - 1;
		return [
			first && left ? 'rounded-tl-field' : '',
			first && right ? 'rounded-tr-field' : '',
			last && left ? 'rounded-bl-field' : '',
			last && right ? 'rounded-br-field' : ''
		]
			.filter(Boolean)
			.join(' ');
	}
</script>

<form onsubmit={submit} novalidate class="flex flex-col gap-4">
	{#if heading}
		<h2 class="text-21 tracking-headline text-fx-ink font-bold">{heading}</h2>
	{/if}

	{#if grouped}
		<div class="rounded-field overflow-hidden border border-[#d8d5cf] bg-white">
			{#each rows as row, r (r)}
				<div class="flex border-b border-[#e2e0dc] last:border-b-0">
					{#each row as f, c (f.name)}
						{@const err = showErrors ? errors[f.name] : ''}
						<div class="min-w-0 flex-1 {c > 0 ? 'border-l border-[#e2e0dc]' : ''}">
							<!-- Placeholder-only is the look; the label still has to exist or the
							     field has no accessible name once it's filled in. -->
							<label class="sr-only" for="{id}-{f.name}">{labelFor(f)}</label>

							{#if isSelect(f)}
								<div class="relative">
									<select
										id="{id}-{f.name}"
										class="{GROUPED} {corners(r, c, row.length)} appearance-none pr-10 {values[f.name]
											? ''
											: 'text-fx-muted'}"
										autocomplete={f.autocomplete}
										aria-invalid={!!err}
										aria-describedby={err ? `${id}-${f.name}-err` : undefined}
										value={values[f.name] ?? ''}
										onchange={(e) => update(f.name, e.currentTarget.value)}
									>
										<option value="" disabled>{labelFor(f)}</option>
										{#if subdivisionsFor(f)}
											{#each subdivisionsFor(f) ?? [] as s (s.code)}
												<option value={s.code} class="text-fx-ink">{s.name}</option>
											{/each}
										{:else}
											{#each f.options ?? countries ?? [] as o (o)}
												<option value={o} class="text-fx-ink">{o}</option>
											{/each}
										{/if}
									</select>
									<svg
										class="text-fx-muted pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="m6 9 6 6 6-6" />
									</svg>
								</div>
							{:else}
								<input
									id="{id}-{f.name}"
									class="{GROUPED} {corners(r, c, row.length)}"
									type={f.type ?? 'text'}
									autocomplete={f.autocomplete}
									inputmode={f.inputmode}
									placeholder={f.placeholder ?? labelFor(f)}
									aria-invalid={!!err}
									aria-describedby={err ? `${id}-${f.name}-err` : undefined}
									value={values[f.name] ?? ''}
									oninput={(e) => update(f.name, e.currentTarget.value)}
								/>
							{/if}

							{#if err}
								<p id="{id}-{f.name}-err" class="text-13 px-4 pb-2 text-[#c8342f]">{err}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each fields as f (f.name)}
				{@const err = showErrors ? errors[f.name] : ''}
				<div class="flex flex-col gap-2 {f.half ? 'sm:col-span-1' : 'sm:col-span-2'}">
					<label class="text-13 text-fx-sub font-medium" for="{id}-{f.name}">
						{labelFor(f)}{#if !requiredFor(f)}<span class="text-fx-muted"> (optional)</span>{/if}
					</label>

					{#if isSelect(f)}
						<select
							id="{id}-{f.name}"
							class={STACKED}
							autocomplete={f.autocomplete}
							aria-invalid={!!err}
							aria-describedby={err ? `${id}-${f.name}-err` : undefined}
							value={values[f.name] ?? ''}
							onchange={(e) => update(f.name, e.currentTarget.value)}
						>
							<option value="" disabled>Select…</option>
							{#if subdivisionsFor(f)}
								{#each subdivisionsFor(f) ?? [] as s (s.code)}
									<option value={s.code}>{s.name}</option>
								{/each}
							{:else}
								{#each f.options ?? countries ?? [] as o (o)}
									<option value={o}>{o}</option>
								{/each}
							{/if}
						</select>
					{:else}
						<input
							id="{id}-{f.name}"
							class={STACKED}
							type={f.type ?? 'text'}
							autocomplete={f.autocomplete}
							inputmode={f.inputmode}
							placeholder={f.placeholder}
							aria-invalid={!!err}
							aria-describedby={err ? `${id}-${f.name}-err` : undefined}
							value={values[f.name] ?? ''}
							oninput={(e) => update(f.name, e.currentTarget.value)}
						/>
					{/if}

					{#if err}
						<p id="{id}-{f.name}-err" class="text-13 text-[#c8342f]">{err}</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	{#if submitLabel}
		<div class="flex flex-col gap-2">
			<button
				type="submit"
				class="rounded-field bg-fx-ink text-15 w-full px-4 py-3 font-medium text-white transition-opacity hover:opacity-90"
			>
				{submitLabel}
			</button>
			{#if note}
				<p class="text-13 text-fx-muted text-center">{note}</p>
			{/if}
		</div>
	{:else if note}
		<p class="text-13 text-fx-muted">{note}</p>
	{/if}
</form>

<style>
	/* currentColor, not var(--color-fx-ink): Tailwind tree-shakes theme variables,
	   so that var() resolves to nothing, the shorthand becomes invalid, and the
	   outline silently falls back to `none`.

	   Inset offset: an outset ring is clipped by the group's overflow-hidden and
	   would disappear on the first and last fields. */
	.cell:focus {
		outline: 2px solid currentColor;
		outline-offset: -2px;
	}
</style>
