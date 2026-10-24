<script lang="ts">
	import type { FullAutoFill } from 'svelte/elements';

	/**
	 * One field of the shop checkout: a box with its label inside, the way
	 * hosted shop checkouts draw them, and its own message underneath.
	 *
	 * The label sits where the text will go and rises to the top of the box once
	 * there is something in it, so the box is both the label and the field. It
	 * stays 16px when it rises; the reference shrinks it to 12px, which is the
	 * size this page's audience (mostly over 55, on a phone) cannot read. The
	 * box is 60px tall to hold both at that size, which also makes it an easy
	 * thing to tap.
	 *
	 * The message is announced with the field (`aria-describedby`) and the box
	 * turns red with it; whether to show it is the caller's call, because only
	 * the block knows whether the buyer has been here yet.
	 *
	 * `stacked` is the classic checkout's drawing of the same field: the label
	 * above the box with a required mark, and a placeholder inside it.
	 */
	let {
		id,
		label,
		value,
		type = 'text',
		autocomplete,
		inputmode,
		options,
		error = '',
		hint = '',
		stacked = false,
		placeholder,
		required = false,
		oninput,
		onblur
	}: {
		id: string;
		label: string;
		value: string;
		type?: 'text' | 'email' | 'tel';
		autocomplete?: FullAutoFill;
		inputmode?: 'text' | 'email' | 'numeric' | 'tel';
		/** Makes it a select. A select always shows its label raised. */
		options?: { value: string; label: string }[];
		error?: string;
		hint?: string;
		stacked?: boolean;
		placeholder?: string;
		/** Marks the label; the check itself is `$lib/checkout-fields.ts`. */
		required?: boolean;
		oninput: (value: string) => void;
		onblur?: () => void;
	} = $props();

	let raised = $derived(stacked || Boolean(options) || value.length > 0);
	let described = $derived([hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' '));
</script>

<div
	class="shop-field"
	class:raised
	class:stacked
	class:invalid={Boolean(error)}
	class:select={Boolean(options)}
>
	{#if stacked}
		<label for={id}>{label}{#if required}<span class="req" aria-hidden="true">*</span>{/if}</label>
	{/if}
	<div class="box">
		{#if options}
			<select
				{id}
				name={id}
				{autocomplete}
				{value}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={described || undefined}
				aria-required={required || undefined}
				onchange={(e) => oninput(e.currentTarget.value)}
				onblur={() => onblur?.()}
			>
				{#if !value}<option value="" disabled>{stacked ? (placeholder ?? '') : ''}</option>{/if}
				{#each options as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
			<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" />
			</svg>
		{:else}
			<input
				{id}
				name={id}
				{type}
				{autocomplete}
				{inputmode}
				{value}
				placeholder={stacked ? placeholder : undefined}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={described || undefined}
				aria-required={required || undefined}
				oninput={(e) => oninput(e.currentTarget.value)}
				onblur={() => onblur?.()}
			/>
		{/if}
		{#if !stacked}<label for={id}>{label}</label>{/if}
	</div>
	{#if error}
		<p class="message" id="{id}-error">{error}</p>
	{/if}
	{#if hint}
		<p class="hint" id="{id}-hint">{hint}</p>
	{/if}
</div>
