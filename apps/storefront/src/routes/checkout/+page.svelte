<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { toAmount } from 'ecomwithai/marketing';
	import { track } from '$lib/analytics/pixel';
	import { countryOptions } from '$lib/countries';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import { DEFAULT_SHIPPING_RATES } from 'ecomwithai';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	type PricedLine = {
		variantId: number;
		slug: string;
		title: string;
		colour: string;
		size: string;
		sku: string;
		unitPriceCents: number;
		quantity: number;
	};

	let priced = $state<{ lines: PricedLine[]; subtotalCents: number; currency: string } | null>(
		null
	);
	let method = $state('standard');
	let submitting = $state(false);
	// Stable per page view: a double-submitted form returns the first order
	// instead of placing a second one.
	const submissionId = crypto.randomUUID();

	// Restore the chosen method when a failed submit sends `form` back.
	$effect(() => {
		const submitted =
			form && 'values' in form && form.values
				? (form.values as Record<string, unknown>).method
				: undefined;
		if (typeof submitted === 'string' && rate(submitted) !== undefined) method = submitted;
	});

	$effect(() => {
		cart.hydrate();
	});

	// Re-price whenever the local cart changes; localStorage prices are display-only.
	$effect(() => {
		if (!cart.hydrated) return;
		const payload = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));

		if (payload.length === 0) {
			priced = { lines: [], subtotalCents: 0, currency: 'USD' };
			return;
		}

		let cancelled = false;
		fetch('/api/cart', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lines: payload })
		})
			.then((res) => res.json())
			.then((data) => {
				if (!cancelled) priced = data;
			})
			.catch(() => {
				if (!cancelled) priced = { lines: [], subtotalCents: 0, currency: 'USD' };
			});

		return () => {
			cancelled = true;
		};
	});

	let checkoutTracked = false;
	$effect(() => {
		if (checkoutTracked || !priced || priced.lines.length === 0) return;
		checkoutTracked = true;
		track('InitiateCheckout', {
			content_type: 'product',
			content_ids: priced.lines.map((l) => l.sku),
			num_items: priced.lines.reduce((sum, l) => sum + l.quantity, 0),
			currency: priced.currency,
			value: toAmount(priced.subtotalCents)
		});
	});

	// Purchase carries the server's event id so Meta dedupes it against the
	// Conversions API copy of the same order.
	let purchaseTracked = false;
	$effect(() => {
		if (purchaseTracked || !form || !('success' in form) || !form.success) return;
		purchaseTracked = true;
		track(
			'Purchase',
			{
				content_type: 'product',
				content_ids: form.order.items.map((i) => i.sku),
				contents: form.order.items.map((i) => ({
					id: i.sku,
					quantity: i.quantity,
					item_price: i.unitPriceCents / 100
				})),
				num_items: form.order.items.reduce((sum, i) => sum + i.quantity, 0),
				currency: form.order.currency,
				value: toAmount(form.order.totalCents)
			},
			form.eventId
		);
		cart.clear();
	});

	const rate = (id: string) => DEFAULT_SHIPPING_RATES.find((r) => r.id === id)?.priceCents;
	let shippingCents = $derived(rate(method) ?? 0);
	let subtotalCents = $derived(priced?.subtotalCents ?? 0);
	let currency = $derived(priced?.currency ?? 'USD');
	let totalCents = $derived(subtotalCents + shippingCents);
	let isEmpty = $derived((priced?.lines.length ?? 0) === 0);

	let countries = $derived(countryOptions(locale));

	let linesPayload = $derived(
		JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
	);

	function colourName(code: string): string {
		return t(`product.colors.${code}` as never);
	}

	const FIELD_LABELS = {
		email: 'checkout.email',
		firstName: 'checkout.firstName',
		lastName: 'checkout.lastName',
		address1: 'checkout.address1',
		city: 'checkout.city',
		postalCode: 'checkout.postalCode',
		country: 'checkout.country'
	} as const;

	/** Re-populates the form after a failed submit so a typo doesn't cost the address. */
	function prev(name: string): string {
		if (!form || !('values' in form) || !form.values) return '';
		const value = (form.values as Record<string, unknown>)[name];
		return typeof value === 'string' ? value : '';
	}

	function fieldError(field: keyof typeof FIELD_LABELS): string | null {
		if (!form || !('fieldErrors' in form) || !form.fieldErrors) return null;
		const code = (form.fieldErrors as Record<string, string | undefined>)[field];
		if (!code) return null;
		if (code === 'emailInvalid') return t('checkout.errors.emailInvalid');
		return t('checkout.errors.fieldRequired', { field: t(FIELD_LABELS[field]) });
	}

	let topLevelError = $derived.by(() => {
		if (!form) return null;
		if ('errorCode' in form && form.errorCode) {
			const code = form.errorCode;
			if (code === 'variant_unavailable') {
				return t('checkout.errors.variantUnavailable', { item: form.detail ?? '' });
			}
			if (code === 'payment_unavailable') return t('checkout.errors.paymentUnavailable');
			return t('checkout.errors.generic');
		}
		if ('fieldErrors' in form && form.fieldErrors?.cart) return t('checkout.errors.cartEmpty');
		return null;
	});

	const inputClass =
		'mt-1.5 block w-full rounded-lg border border-ink-200 px-3 py-2.5 focus:border-tide-500';
</script>

<svelte:head>
	<title>{t('checkout.title')} · {t('common.brand')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	{#if form && 'success' in form && form.success}
		<section class="mx-auto max-w-xl py-16 text-center">
			<h1 class="text-3xl font-semibold tracking-tight">{t('checkout.successTitle')}</h1>
			<p class="mt-4 text-ink-600">
				{t('checkout.successBody', {
					orderNumber: form.order.orderNumber,
					email: form.email
				})}
			</p>
			<dl class="mx-auto mt-8 max-w-xs space-y-2 text-sm">
				<div class="flex justify-between">
					<dt class="text-ink-600">{t('checkout.total')}</dt>
					<dd class="font-medium">
						{formatMoney(form.order.totalCents, locale, form.order.currency)}
					</dd>
				</div>
			</dl>
			<a
				href="/products/dog-life-jacket"
				class="mt-8 inline-block rounded-xl bg-ink-900 px-6 py-3 font-medium text-white"
			>
				{t('checkout.successContinue')}
			</a>
		</section>
	{:else}
		<h1 class="text-3xl font-semibold tracking-tight">{t('checkout.title')}</h1>

		{#if topLevelError}
			<p
				class="mt-6 rounded-lg border border-coral-500 bg-coral-500/5 px-4 py-3 text-sm text-coral-600"
				role="alert"
			>
				{topLevelError}
			</p>
		{:else if data.cancelled}
			<!-- Backing out of Stripe is not an error, and saying "nothing was
			     charged" up front stops the second attempt people make when they
			     aren't sure. -->
			<p class="mt-6 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-600">
				{t('checkout.cancelled')}
			</p>
		{/if}

		<div class="mt-8 grid gap-12 lg:grid-cols-[1fr_22rem]">
			<form
				method="POST"
				class="order-2 lg:order-1"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="lines" value={linesPayload} />
				<input type="hidden" name="submissionId" value={submissionId} />

				<fieldset>
					<legend class="text-lg font-medium">{t('checkout.contactTitle')}</legend>
					<label class="mt-4 block">
						<span class="text-sm font-medium">{t('checkout.email')}</span>
						<input
							type="email"
							name="email"
							value={prev('email')}
							autocomplete="email"
							required
							class={inputClass}
							aria-invalid={fieldError('email') ? 'true' : undefined}
						/>
						{#if fieldError('email')}
							<span class="mt-1 block text-sm text-coral-600">{fieldError('email')}</span>
						{:else}
							<span class="mt-1 block text-sm text-ink-400">{t('checkout.emailHint')}</span>
						{/if}
					</label>
					<label class="mt-4 block">
						<span class="text-sm font-medium">{t('checkout.phone')}</span>
						<input type="tel" name="phone"
							value={prev('phone')} autocomplete="tel" class={inputClass} />
					</label>
				</fieldset>

				<fieldset class="mt-10">
					<legend class="text-lg font-medium">{t('checkout.shippingTitle')}</legend>
					<div class="mt-4 grid gap-4 sm:grid-cols-2">
						<label class="block">
							<span class="text-sm font-medium">{t('checkout.firstName')}</span>
							<input
								name="firstName"
							value={prev('firstName')}
								autocomplete="given-name"
								required
								class={inputClass}
								aria-invalid={fieldError('firstName') ? 'true' : undefined}
							/>
							{#if fieldError('firstName')}
								<span class="mt-1 block text-sm text-coral-600">{fieldError('firstName')}</span>
							{/if}
						</label>
						<label class="block">
							<span class="text-sm font-medium">{t('checkout.lastName')}</span>
							<input
								name="lastName"
							value={prev('lastName')}
								autocomplete="family-name"
								required
								class={inputClass}
								aria-invalid={fieldError('lastName') ? 'true' : undefined}
							/>
							{#if fieldError('lastName')}
								<span class="mt-1 block text-sm text-coral-600">{fieldError('lastName')}</span>
							{/if}
						</label>
					</div>

					<label class="mt-4 block">
						<span class="text-sm font-medium">{t('checkout.address1')}</span>
						<input
							name="address1"
							value={prev('address1')}
							autocomplete="address-line1"
							required
							class={inputClass}
							aria-invalid={fieldError('address1') ? 'true' : undefined}
						/>
						{#if fieldError('address1')}
							<span class="mt-1 block text-sm text-coral-600">{fieldError('address1')}</span>
						{/if}
					</label>

					<label class="mt-4 block">
						<span class="text-sm font-medium">{t('checkout.address2')}</span>
						<input name="address2"
							value={prev('address2')} autocomplete="address-line2" class={inputClass} />
					</label>

					<div class="mt-4 grid gap-4 sm:grid-cols-3">
						<label class="block">
							<span class="text-sm font-medium">{t('checkout.city')}</span>
							<input
								name="city"
							value={prev('city')}
								autocomplete="address-level2"
								required
								class={inputClass}
								aria-invalid={fieldError('city') ? 'true' : undefined}
							/>
							{#if fieldError('city')}
								<span class="mt-1 block text-sm text-coral-600">{fieldError('city')}</span>
							{/if}
						</label>
						<label class="block">
							<span class="text-sm font-medium">{t('checkout.province')}</span>
							<input name="province"
							value={prev('province')} autocomplete="address-level1" class={inputClass} />
						</label>
						<label class="block">
							<span class="text-sm font-medium">{t('checkout.postalCode')}</span>
							<input
								name="postalCode"
							value={prev('postalCode')}
								autocomplete="postal-code"
								required
								class={inputClass}
								aria-invalid={fieldError('postalCode') ? 'true' : undefined}
							/>
							{#if fieldError('postalCode')}
								<span class="mt-1 block text-sm text-coral-600">{fieldError('postalCode')}</span>
							{/if}
						</label>
					</div>

					<label class="mt-4 block">
						<span class="text-sm font-medium">{t('checkout.country')}</span>
						<select
							name="country"
							value={prev('country')}
							autocomplete="country"
							required
							class={inputClass}
							aria-invalid={fieldError('country') ? 'true' : undefined}
						>
							<option value="" disabled selected={!prev('country')}></option>
							{#each countries as option (option.code)}
								<option value={option.code}>{option.name}</option>
							{/each}
						</select>
						{#if fieldError('country')}
							<span class="mt-1 block text-sm text-coral-600">{fieldError('country')}</span>
						{/if}
					</label>
				</fieldset>

				<fieldset class="mt-10">
					<legend class="text-lg font-medium">{t('checkout.methodTitle')}</legend>
					<div class="mt-4 divide-y divide-ink-200 rounded-xl border border-ink-200">
						{#each [{ id: 'standard', label: 'checkout.methodStandard', eta: 'checkout.methodStandardEta' }, { id: 'express', label: 'checkout.methodExpress', eta: 'checkout.methodExpressEta' }] as const as option (option.id)}
							<label class="flex cursor-pointer items-center gap-3 px-4 py-3.5">
								<input
									type="radio"
									name="method"
									value={option.id}
									bind:group={method}
									class="size-4 accent-tide-600"
								/>
								<span class="flex-1">
									<span class="block text-sm font-medium">{t(option.label)}</span>
									<span class="block text-sm text-ink-400">{t(option.eta)}</span>
								</span>
								<span class="text-sm font-medium">
									{(rate(option.id) ?? 0) === 0
										? t('checkout.free')
										: formatMoney(rate(option.id) ?? 0, locale, currency)}
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<section class="mt-10">
					<h2 class="text-lg font-medium">{t('checkout.paymentTitle')}</h2>
					<p
						class="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3.5 text-sm text-ink-600"
					>
						{data.paymentsEnabled
							? t('checkout.paymentCardNote')
							: t('checkout.paymentPending')}
					</p>
				</section>

				<button
					type="submit"
					disabled={submitting || isEmpty}
					class="mt-8 w-full rounded-xl bg-ink-900 px-6 py-4 font-medium text-white transition hover:bg-ink-600 disabled:cursor-not-allowed disabled:bg-ink-200"
				>
					{#if submitting}
						{data.paymentsEnabled ? t('checkout.payingRedirect') : t('checkout.placing')}
					{:else}
						{data.paymentsEnabled ? t('checkout.payWithCard') : t('checkout.placeOrder')}
					{/if}
				</button>
			</form>

			<!-- Summary -->
			<aside class="order-1 lg:order-2">
				<div class="rounded-2xl border border-ink-200 p-5 lg:sticky lg:top-6">
					<h2 class="text-lg font-medium">{t('checkout.summaryTitle')}</h2>

					{#if priced === null}
						<p class="mt-4 text-sm text-ink-400">{t('common.loading')}</p>
					{:else if isEmpty}
						<p class="mt-4 text-sm text-ink-600">{t('cart.empty')}</p>
						<a
							href="/products/dog-life-jacket"
							class="mt-4 inline-block text-sm font-medium text-tide-600 hover:text-tide-700"
						>
							{t('cart.emptyAction')}
						</a>
					{:else}
						<ul class="mt-4 space-y-4">
							{#each priced.lines as line (line.variantId)}
								<li class="flex items-start justify-between gap-3 text-sm">
									<div>
										<p class="font-medium">{line.title}</p>
										<p class="text-ink-400">
											{colourName(line.colour)} · {line.size} · {t('cart.quantity')}
											{line.quantity}
										</p>
										<button
											type="button"
											onclick={() => cart.remove(line.variantId)}
											class="mt-1 text-xs text-ink-400 underline hover:text-coral-600"
										>
											{t('cart.remove')}
										</button>
									</div>
									<span class="font-medium whitespace-nowrap">
										{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
									</span>
								</li>
							{/each}
						</ul>

						<dl class="mt-5 space-y-2 border-t border-ink-200 pt-5 text-sm">
							<div class="flex justify-between">
								<dt class="text-ink-600">{t('checkout.subtotal')}</dt>
								<dd>{formatMoney(subtotalCents, locale, currency)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-ink-600">{t('checkout.shipping')}</dt>
								<dd>
									{shippingCents === 0
										? t('checkout.free')
										: formatMoney(shippingCents, locale, currency)}
								</dd>
							</div>
							<div
								class="flex justify-between border-t border-ink-200 pt-3 text-base font-semibold"
							>
								<dt>{t('checkout.total')}</dt>
								<dd>{formatMoney(totalCents, locale, currency)}</dd>
							</div>
						</dl>
					{/if}
				</div>
			</aside>
		</div>
	{/if}
</div>
