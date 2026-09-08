<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toAmount } from 'ecomwithai/marketing';
	import { track } from '$lib/analytics/pixel';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	// The browser half of the Purchase event. It carries the same event id the
	// Conversions API sent from the webhook, so Meta counts one sale.
	//
	// Only fires once the payment actually succeeded — the customer landing here
	// means Stripe redirected them, not that the money cleared.
	let tracked = false;
	$effect(() => {
		if (tracked || !data.paid) return;
		tracked = true;
		track(
			'Purchase',
			{
				content_type: 'product',
				content_ids: data.order.items.map((i) => i.sku),
				contents: data.order.items.map((i) => ({
					id: i.sku,
					quantity: i.quantity,
					item_price: i.unitPriceCents / 100
				})),
				num_items: data.order.items.reduce((sum, i) => sum + i.quantity, 0),
				currency: data.order.currency,
				value: toAmount(data.order.totalCents)
			},
			data.eventId
		);
		cart.clear();
	});

	// Card authorisations settle in seconds. Anything still unpaid after this
	// window is a delayed payment method that can take hours, and the webhook's
	// Conversions API copy is what reports those — polling on would only cost
	// the worker requests nobody reads.
	const POLL_FIRST_MS = 1000;
	const POLL_MAX_MS = 8000;
	const POLL_WINDOW_MS = 90_000;

	// Stripe redirects the moment the card is authorised, which is routinely
	// before the webhook that flips the order to paid has landed. The load ran
	// once, so a customer arriving inside that window sees "processing" and the
	// Purchase above never fires for them — they don't reload, they close the
	// tab. Ask the server again instead of waiting for them to.
	//
	// Deliberately not a `$effect`: `invalidateAll` replaces `data`, which would
	// re-run the effect and reset both the backoff and the deadline, leaving it
	// polling at the opening interval until the tab closed.
	onMount(() => {
		if (data.paid) return;

		let timer: ReturnType<typeof setTimeout>;
		let stopped = false;
		let delay = POLL_FIRST_MS;
		const deadline = Date.now() + POLL_WINDOW_MS;

		const poll = async () => {
			if (stopped) return;
			// A failed refresh is not worth surfacing on a receipt, and it must
			// not end the loop: the next tick asks again.
			await invalidateAll().catch(() => {});
			if (stopped || data.paid || Date.now() >= deadline) return;
			delay = Math.min(delay * 2, POLL_MAX_MS);
			timer = setTimeout(poll, delay);
		};

		timer = setTimeout(poll, delay);
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	});
</script>

<svelte:head>
	<title>{data.paid ? t('checkout.paidTitle') : t('checkout.processingTitle')} · {t('common.brand')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<section class="mx-auto max-w-xl py-16 text-center">
		<h1 class="text-3xl font-semibold tracking-tight">
			{data.paid ? t('checkout.paidTitle') : t('checkout.processingTitle')}
		</h1>
		<p class="mt-4 text-ink-600">
			{data.paid
				? t('checkout.paidBody', { orderNumber: data.order.orderNumber })
				: t('checkout.processingBody', { orderNumber: data.order.orderNumber })}
		</p>

		<dl class="mx-auto mt-8 max-w-xs space-y-2 text-sm">
			<div class="flex justify-between">
				<dt class="text-ink-600">{t('checkout.orderLabel')}</dt>
				<dd class="font-medium">{data.order.orderNumber}</dd>
			</div>
			<div class="flex justify-between">
				<dt class="text-ink-600">{t('checkout.total')}</dt>
				<dd class="font-medium">
					{formatMoney(data.order.totalCents, locale, data.order.currency)}
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
</div>
