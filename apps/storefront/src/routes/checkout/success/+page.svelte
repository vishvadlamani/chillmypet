<script lang="ts">
	import { page } from '$app/state';
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
