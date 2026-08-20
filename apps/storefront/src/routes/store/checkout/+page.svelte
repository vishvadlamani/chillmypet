<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import PageLayout from '@funnel/core/PageLayout.svelte';
	import { DR_BLOCKS } from '@funnel/blocks-dr';
	import { countryForm } from '@funnel/blocks-dr/subdivisions';
	import type { FunnelStateAdapter, SubmitFn, TrackFn } from '@funnel/core';
	import { DEFAULT_SHIPPING_RATES } from 'ecomwithai';
	import { toAmount } from 'ecomwithai/marketing';
	import { track as pixel } from '$lib/analytics/pixel';
	import { countryOptions } from '$lib/countries';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import CardFields from '$lib/components/CardFields.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	/**
	 * Nothing the checkout blocks emit is one of Meta's events. What matters here
	 * — checkout started, payment details submitted — are host moments, because
	 * only the host knows the cart and the total, so they are fired below rather
	 * than forwarded from a block. Unmapped block events are dropped rather than
	 * passed through under their own names: an ad account full of
	 * `shipping_method_selected` is noise no campaign optimises against.
	 */
	const track: TrackFn = () => {};

	/**
	 * The forms write every keystroke into host state, so the fields need no
	 * submit action of their own — the button that posts the order reads all
	 * three at once. `shipping` arrives anyway if a manifest ever gives the
	 * address form a button; taking the payload is cheaper than the state
	 * diverging from what was submitted.
	 */
	const submit: SubmitFn = (action, _subject, payload = {}) => {
		if (action !== 'shipping' && action !== 'contact') return;
		for (const [key, value] of Object.entries(payload)) {
			if (typeof value === 'string') funnelState.set(key, value);
		}
	};

	// Backed by sessionStorage, not a stub: the forms write every keystroke here,
	// and a checkout that forgets a half-typed address on a reload is a checkout
	// people leave. Shared key with the product page so anything already captured
	// carries across.
	const KEY = 'store-state';
	// `$state`, not a plain object. The adapter's reads are methods precisely so a
	// reactive host returns a live value on each call — blocks that mirror another
	// block's choice (the dock following the bundle picker) depend on that, and a
	// plain object leaves them frozen on whatever they saw first. The host's own
	// summary, validation and hidden fields read the same object for the same
	// reason.
	const bag: Record<string, string> = $state(
		(() => {
			if (typeof sessionStorage === 'undefined') return {};
			try {
				return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
			} catch {
				return {};
			}
		})()
	);
	const persist = () => sessionStorage.setItem(KEY, JSON.stringify(bag));

	const funnelState: FunnelStateAdapter = {
		begin: () => {},
		get: (f) => bag[f] ?? '',
		set: (f, v) => {
			bag[f] = v;
			persist();
		},
		answer: (k) => bag[k] ?? '',
		setAnswer: (k, v) => {
			bag[k] = v;
			persist();
		},
		city: () => ''
	};

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

	type Priced = {
		lines: PricedLine[];
		subtotalCents: number;
		discountCents: number;
		bundlePercentOff: number;
		currency: string;
	};

	const EMPTY: Priced = {
		lines: [],
		subtotalCents: 0,
		discountCents: 0,
		bundlePercentOff: 0,
		currency: 'USD'
	};

	let priced = $state<Priced | null>(null);
	let submitting = $state(false);
	let showIssues = $state(false);
	// Stable per page view: a double-submitted form returns the first order
	// instead of placing a second one.
	const submissionId = crypto.randomUUID();

	$effect(() => {
		cart.hydrate();
	});

	// Re-price whenever the local cart changes. Stored prices are display-only —
	// this endpoint and the order action are the only sources of truth, and it is
	// what makes the bundle discount show the figure that gets charged.
	$effect(() => {
		if (!cart.hydrated) return;
		const payload = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));

		if (payload.length === 0) {
			priced = EMPTY;
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
				if (!cancelled) priced = EMPTY;
			});

		return () => {
			cancelled = true;
		};
	});

	const rate = (id: string) => DEFAULT_SHIPPING_RATES.find((r) => r.id === id)?.priceCents;

	// The method block writes its own default back to state on mount, so this
	// follows whatever it chose rather than restating a default of its own.
	let method = $derived.by(() => {
		const chosen = bag.shippingMethod ?? '';
		return rate(chosen) === undefined ? 'standard' : chosen;
	});
	let shippingCents = $derived(rate(method) ?? 0);
	let subtotalCents = $derived(priced?.subtotalCents ?? 0);
	let discountCents = $derived(priced?.discountCents ?? 0);
	let bundlePercentOff = $derived(priced?.bundlePercentOff ?? 0);
	let currency = $derived(priced?.currency ?? 'USD');
	let totalCents = $derived(subtotalCents - discountCents + shippingCents);
	let isEmpty = $derived((priced?.lines.length ?? 0) === 0);

	let countries = $derived(countryOptions(locale));

	/**
	 * The country arrives as a display name — it's what the select shows and what
	 * the address provider returns. The order takes ISO codes and rejects
	 * anything else, so the translation happens here, in the host, rather than
	 * being pushed into the block as a prop.
	 */
	let countryCode = $derived.by(() => {
		const raw = (bag.country ?? '').trim();
		if (!raw) return '';
		if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
		return countries.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.code ?? '';
	});

	let linesPayload = $derived(
		JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
	);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	/**
	 * The cross-form check.
	 *
	 * Each block validates only its own fields, and none of them has a submit
	 * button — so nothing on the page knows the address is missing an email
	 * except the thing that posts the order. That check belongs next to the pay
	 * button, which is why it lives here rather than in a manifest.
	 */
	let issues = $derived.by(() => {
		const list: string[] = [];
		const required = (value: string | undefined, label: string) => {
			if (!(value ?? '').trim()) list.push(t('checkout.errors.fieldRequired', { field: label }));
		};

		required(bag.fullName, t('checkout.fullName'));

		const email = (bag.email ?? '').trim();
		if (!email) required('', t('checkout.email'));
		else if (!EMAIL.test(email)) list.push(t('checkout.errors.emailInvalid'));

		required(bag.address, t('checkout.address1'));
		required(bag.city, t('checkout.city'));
		required(bag.zip, t('checkout.postalCode'));
		if (!countryCode) list.push(t('checkout.errors.fieldRequired', { field: t('checkout.country') }));
		// Required-ness is per country: a UK address posts fine with no county.
		if (countryForm(bag.country).stateRequired) required(bag.state, t('checkout.province'));

		return list;
	});

	// Card fields live in this page's form. `cardApi` is handed over once Stripe
	// has mounted; null means it could not, and the submit falls through to the
	// server's hosted-page path instead of stranding the customer.
	let cardApi = $state<{
		confirm: (i: { clientSecret: string; returnUrl: string }) => Promise<{ error?: { message?: string } }>;
	} | null>(null);
	let cardUnavailable = $state(false);
	let payError = $state<string | null>(null);

	function onCardReady(api: typeof cardApi) {
		cardApi = api;
		cardUnavailable = api === null;
	}

	let checkoutTracked = false;
	$effect(() => {
		if (checkoutTracked || !priced || priced.lines.length === 0) return;
		checkoutTracked = true;
		pixel('InitiateCheckout', {
			content_type: 'product',
			content_ids: priced.lines.map((l) => l.sku),
			num_items: priced.lines.reduce((sum, l) => sum + l.quantity, 0),
			currency: priced.currency,
			value: toAmount(priced.subtotalCents)
		});
	});

	// The action hands back an intent for the fields already on screen.
	$effect(() => {
		const pay =
			form && 'pay' in form
				? (form.pay as { clientSecret: string; returnUrl: string } | undefined)
				: undefined;
		if (!pay || !cardApi) return;
		let done = false;
		(async () => {
			if (done) return;
			done = true;
			const result = await cardApi!.confirm(pay);
			if (result.error) {
				payError = result.error.message ?? t('checkout.errors.generic');
				submitting = false;
				return;
			}
			cart.clear();
			window.location.href = pay.returnUrl;
		})();
	});

	// Only reachable with no payment provider configured — with Stripe on, the
	// order is confirmed on /checkout/success instead. Carries the server's event
	// id so Meta dedupes it against the Conversions API copy of the same sale.
	let purchaseTracked = false;
	$effect(() => {
		if (purchaseTracked || !form || !('success' in form) || !form.success) return;
		purchaseTracked = true;
		pixel(
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

	/**
	 * What the server rejected, in the same list as what the page caught.
	 *
	 * The action validates again — it has to, since a form post is not the only
	 * way to reach it — and its verdict can differ from this page's: a country
	 * that isn't an ISO code, a field the blocks never asked for. Without this
	 * the button would post, come back rejected, and change nothing on screen,
	 * which reads as a checkout that is simply broken.
	 */
	const FIELD_LABELS: Record<string, string> = {
		fullName: 'checkout.fullName',
		firstName: 'checkout.firstName',
		lastName: 'checkout.lastName',
		email: 'checkout.email',
		address1: 'checkout.address1',
		city: 'checkout.city',
		postalCode: 'checkout.postalCode',
		country: 'checkout.country'
	};

	let serverIssues = $derived.by(() => {
		if (!form || !('fieldErrors' in form) || !form.fieldErrors) return [];
		return Object.entries(form.fieldErrors as Record<string, string | undefined>).flatMap(
			([field, code]) => {
				// The empty cart has its own message above; it isn't a field.
				if (!code || field === 'cart') return [];
				if (code === 'emailInvalid') return [t('checkout.errors.emailInvalid')];
				const label = FIELD_LABELS[field];
				return [t('checkout.errors.fieldRequired', { field: label ? t(label as never) : field })];
			}
		);
	});

	let shownIssues = $derived([...(showIssues ? issues : []), ...serverIssues]);

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

	function colourName(code: string): string {
		return t(`product.colors.${code}` as never);
	}
</script>

<svelte:head>
	<title>{t('checkout.title')} · {t('common.brand')}</title>
	<!-- Poppins only on the storefront. Loaded here rather than in app.html so
	     /quiz and /checkout-dr* don't pay for a font they never render. -->
	<link
		href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="storefront-type bg-fx-bg min-h-svh pb-12">
	{#if form && 'success' in form && form.success}
		<section class="max-w-page px-gutter mx-auto flex flex-col gap-4 py-16 text-center">
			<h1 class="text-33 tracking-display text-fx-ink font-bold">{t('checkout.successTitle')}</h1>
			<p class="text-17 text-fx-sub">
				{t('checkout.successBody', { orderNumber: form.order.orderNumber, email: form.email })}
			</p>
			<p class="text-17 text-fx-ink font-semibold">
				{t('checkout.total')}: {formatMoney(form.order.totalCents, locale, form.order.currency)}
			</p>
			<a
				href="/store"
				class="rounded-field bg-fx-ink text-15 mx-auto mt-4 px-6 py-3 font-medium text-white"
			>
				{t('checkout.successContinue')}
			</a>
		</section>
	{:else}
		<!-- Contact, address and shipping method are blocks; everything below them
		     is host chrome. Payment deliberately is not a block: unknown block
		     types are skipped by design, which on a checkout would render a page
		     that looks complete and silently cannot take money. -->
		<PageLayout
			definition={data.definition}
			version={data.version}
			components={DR_BLOCKS}
			{track}
			{submit}
			state={funnelState}
			mainClass="flex flex-col gap-6 py-8"
		/>

		<form
			method="POST"
			class="max-w-page px-gutter mx-auto flex flex-col gap-6"
			use:enhance={({ cancel }) => {
				showIssues = true;
				// The blocks each validate their own fields and none of them has a
				// button, so this is the only place the whole form is checked.
				if (issues.length > 0) {
					cancel();
					return;
				}
				submitting = true;
				payError = null;
				pixel('AddPaymentInfo', {
					content_type: 'product',
					content_ids: priced?.lines.map((l) => l.sku) ?? [],
					currency,
					value: toAmount(totalCents)
				});
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<!-- What the blocks wrote into host state, in the names the order takes.
			     The mapping lives here because the block's job ends at "these are
			     the fields"; what an address is called downstream is the host's. -->
			<input type="hidden" name="fullName" value={bag.fullName ?? ''} />
			<input type="hidden" name="email" value={bag.email ?? ''} />
			<input type="hidden" name="phone" value={bag.phone ?? ''} />
			<input type="hidden" name="address1" value={bag.address ?? ''} />
			<input type="hidden" name="address2" value={bag.address2 ?? ''} />
			<input type="hidden" name="city" value={bag.city ?? ''} />
			<input type="hidden" name="province" value={bag.state ?? ''} />
			<input type="hidden" name="postalCode" value={bag.zip ?? ''} />
			<input type="hidden" name="country" value={countryCode} />
			<input type="hidden" name="method" value={method} />
			<input type="hidden" name="lines" value={linesPayload} />
			<!-- Tells the server whether the card fields are actually usable. If
			     Stripe.js was blocked, there is nothing on this page to confirm
			     against, so the order has to go via the hosted page instead. -->
			<input type="hidden" name="cardReady" value={cardApi ? '1' : '0'} />
			<input type="hidden" name="submissionId" value={submissionId} />

			<section class="flex flex-col gap-4">
				<h2 class="text-21 tracking-headline text-fx-ink font-bold">
					{t('checkout.paymentTitle')}
				</h2>

				{#if data.paymentsEnabled && data.stripePublishableKey && !cardUnavailable}
					<div class="rounded-field border border-[#d8d5cf] bg-white p-4">
						<!-- Stripe.js is a third-party script on a phone connection, and an
						     empty bordered box reads as a broken checkout. Say what it is
						     waiting for until the fields report themselves ready. -->
						{#if !cardApi}
							<p class="text-15 text-fx-muted">{t('checkout.paymentLoading')}</p>
						{/if}
						<CardFields
							publishableKey={data.stripePublishableKey}
							paymentMethodConfiguration={data.stripePaymentMethodConfiguration}
							amountCents={totalCents}
							{currency}
							onready={onCardReady}
						/>
					</div>
				{:else}
					<p class="rounded-field text-15 text-fx-sub border border-[#d8d5cf] bg-white px-4 py-3">
						{data.paymentsEnabled ? t('checkout.paymentHostedNote') : t('checkout.paymentPending')}
					</p>
				{/if}
			</section>

			<section class="flex flex-col gap-4">
				<h2 class="text-21 tracking-headline text-fx-ink font-bold">
					{t('checkout.summaryTitle')}
				</h2>

				<div class="rounded-field border border-[#d8d5cf] bg-white px-4 py-4">
					{#if priced === null}
						<p class="text-15 text-fx-muted">{t('common.loading')}</p>
					{:else if isEmpty}
						<p class="text-15 text-fx-sub">{t('cart.empty')}</p>
						<a href="/store" class="text-15 text-fx-ink mt-2 inline-block font-medium underline">
							{t('cart.emptyAction')}
						</a>
					{:else}
						<ul class="flex flex-col gap-3">
							{#each priced.lines as line (line.variantId)}
								<li class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-15 text-fx-ink font-medium">{line.title}</p>
										<p class="text-13 text-fx-muted">
											{colourName(line.colour)} · {line.size} · {t('cart.quantity')}
											{line.quantity}
										</p>
										<button
											type="button"
											onclick={() => cart.remove(line.variantId)}
											class="text-13 text-fx-muted mt-1 underline"
										>
											{t('cart.remove')}
										</button>
									</div>
									<span class="text-15 text-fx-ink font-semibold whitespace-nowrap tabular-nums">
										{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
									</span>
								</li>
							{/each}
						</ul>

						<dl class="mt-4 flex flex-col gap-2 border-t border-[#e2e0dc] pt-4">
							<div class="text-15 flex justify-between">
								<dt class="text-fx-sub">{t('checkout.subtotal')}</dt>
								<dd class="text-fx-ink tabular-nums">
									{formatMoney(subtotalCents, locale, currency)}
								</dd>
							</div>
							{#if discountCents > 0}
								<div class="text-15 flex justify-between text-[#2f6b3d]">
									<dt>{t('checkout.bundleDiscount')} ({bundlePercentOff}%)</dt>
									<dd class="tabular-nums">−{formatMoney(discountCents, locale, currency)}</dd>
								</div>
							{/if}
							<div class="text-15 flex justify-between">
								<dt class="text-fx-sub">{t('checkout.shipping')}</dt>
								<dd class="text-fx-ink tabular-nums">
									{shippingCents === 0
										? t('checkout.free')
										: formatMoney(shippingCents, locale, currency)}
								</dd>
							</div>
							<div
								class="text-19 text-fx-ink flex justify-between border-t border-[#e2e0dc] pt-3 font-bold"
							>
								<dt>{t('checkout.total')}</dt>
								<dd class="tabular-nums">{formatMoney(totalCents, locale, currency)}</dd>
							</div>
						</dl>
					{/if}
				</div>
			</section>

			{#if topLevelError}
				<p
					class="rounded-field text-15 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
					role="alert"
				>
					{topLevelError}
				</p>
			{:else if data.cancelled}
				<!-- Backing out of Stripe is not an error, and saying "nothing was
				     charged" up front stops the second attempt people make when they
				     aren't sure. -->
				<p class="rounded-field text-15 text-fx-sub border border-[#d8d5cf] bg-white px-4 py-3">
					{t('checkout.cancelled')}
				</p>
			{/if}

			{#if payError}
				<p
					class="rounded-field text-15 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
					role="alert"
				>
					{payError}
				</p>
			{/if}

			{#if shownIssues.length > 0}
				<ul
					class="rounded-field text-15 flex flex-col gap-1 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
					role="alert"
				>
					{#each shownIssues as issue (issue)}
						<li>{issue}</li>
					{/each}
				</ul>
			{/if}

			<button
				type="submit"
				disabled={submitting || isEmpty}
				class="rounded-field bg-fx-ink text-17 w-full px-4 py-4 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			>
				{#if submitting}
					{t('checkout.placing')}
				{:else if totalCents > 0}
					{t('checkout.payNow', { total: formatMoney(totalCents, locale, currency) })}
				{:else}
					{t('checkout.placeOrder')}
				{/if}
			</button>
		</form>
	{/if}
</div>

<style>
	/*
	 * Redefines the token for THIS SUBTREE ONLY.
	 *
	 * `--font-sans` is global and the live funnel renders through the same
	 * stylesheet — changing it in layout.css would restyle /quiz, /lp and
	 * /checkout-dr*, which must keep rendering identically. Scoping it to the
	 * page's root element means everything inside inherits Poppins and nothing
	 * outside notices.
	 */
	.storefront-type {
		--font-sans: 'Poppins', ui-sans-serif, system-ui, sans-serif;
		font-family: var(--font-sans);
	}
</style>
