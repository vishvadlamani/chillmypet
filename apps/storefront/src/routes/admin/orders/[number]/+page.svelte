<script lang="ts">
	import { enhance } from '$app/forms';
	import { money, statusLabel, when } from '../../format';

	let { data, form } = $props();
	let order = $derived(data.order);
	let submitting = $state(false);

	const REASONS: Record<string, string> = {
		not_paid: 'Only a paid order can be marked shipped.',
		already_shipped: 'This order was already marked shipped.',
		order_not_found: 'This order no longer exists.'
	};
</script>

<svelte:head>
	<title>{order.orderNumber} · Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8">
	<a href="/admin" class="text-sm text-ink-600 hover:text-ink-900">← Orders</a>

	<header class="mt-3 mb-6 flex flex-wrap items-baseline gap-3">
		<h1 class="text-2xl font-semibold">{order.orderNumber}</h1>
		<span class="rounded bg-ink-100 px-2 py-0.5 text-sm">
			{data.fulfillment ? 'Shipped' : statusLabel(order.status)}
		</span>
		<span class="text-sm text-ink-600">{when(order.createdAt ?? null)}</span>
	</header>

	<div class="grid gap-6 md:grid-cols-[1fr_18rem]">
		<section class="self-start rounded-lg border border-ink-200">
			<table class="w-full text-sm">
				<tbody>
					{#each order.items as item, i (i)}
						<tr class="border-b border-ink-100">
							<td class="px-4 py-3">
								<div class="font-medium">{item.title}</div>
								<div class="text-ink-600">
									{item.options.filter(Boolean).join(' · ')}{item.options.some(Boolean) ? ' · ' : ''}SKU {item.sku}
								</div>
							</td>
							<td class="px-4 py-3 text-right whitespace-nowrap">
								{item.quantity} × {money(item.unitPriceCents, order.currency)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<dl class="space-y-1 px-4 py-3 text-sm">
				<div class="flex justify-between"><dt class="text-ink-600">Subtotal</dt><dd>{money(order.subtotalCents, order.currency)}</dd></div>
				{#if order.discountCents > 0}
					<div class="flex justify-between"><dt class="text-ink-600">Discount</dt><dd>−{money(order.discountCents, order.currency)}</dd></div>
				{/if}
				<div class="flex justify-between">
					<dt class="text-ink-600">Shipping ({order.shipping.method})</dt>
					<dd>{money(order.shippingCents, order.currency)}</dd>
				</div>
				<div class="flex justify-between font-semibold"><dt>Total</dt><dd>{money(order.totalCents, order.currency)}</dd></div>
			</dl>
		</section>

		<aside class="space-y-6 text-sm">
			<section>
				<h2 class="mb-1 font-semibold">Ship to</h2>
				<p class="leading-relaxed">
					{order.shipping.firstName} {order.shipping.lastName}<br />
					{order.shipping.address1}<br />
					{#if order.shipping.address2}{order.shipping.address2}<br />{/if}
					{order.shipping.city}{order.shipping.province ? `, ${order.shipping.province}` : ''} {order.shipping.postalCode}<br />
					{order.shipping.country}
				</p>
				{#if order.shipping.phone}<p class="mt-1">{order.shipping.phone}</p>{/if}
			</section>

			<section>
				<h2 class="mb-1 font-semibold">Customer</h2>
				<p><a class="underline" href="/admin?q={encodeURIComponent(order.email)}">{order.email}</a></p>
				{#if data.customer}
					<p class="text-ink-600">
						{data.customer.ordersCount} order{data.customer.ordersCount === 1 ? '' : 's'} ·
						{money(data.customer.totalSpentCents, order.currency)} lifetime
					</p>
				{/if}
			</section>

			<section>
				<h2 class="mb-1 font-semibold">Payment</h2>
				{#if data.payment}
					<p>{data.payment.status} · {money(data.payment.amountCents, data.payment.currency)} via {data.payment.provider}</p>
					{#if data.payment.providerRef}<p class="break-all text-ink-600">{data.payment.providerRef}</p>{/if}
					{#if data.payment.failureReason}<p class="text-red-700">{data.payment.failureReason}</p>{/if}
					<p class="mt-1 text-ink-600">Refunds are issued from the Stripe dashboard.</p>
				{:else}
					<p class="text-ink-600">No payment recorded.</p>
				{/if}
			</section>

			<section>
				<h2 class="mb-2 font-semibold">Shipping</h2>
				{#if data.fulfillment}
					<p>Shipped {when(data.fulfillment.shippedAt)}</p>
					{#if data.fulfillment.carrier || data.fulfillment.trackingNumber}
						<p>{[data.fulfillment.carrier, data.fulfillment.trackingNumber].filter(Boolean).join(' ')}</p>
					{/if}
					{#if data.fulfillment.trackingUrl}
						<p><a class="underline" href={data.fulfillment.trackingUrl} rel="noreferrer" target="_blank">Tracking link</a></p>
					{/if}
				{:else if order.status === 'paid'}
					<form
						method="POST"
						action="?/ship"
						class="space-y-2"
						use:enhance={() => {
							submitting = true;
							return async ({ update }) => {
								await update();
								submitting = false;
							};
						}}
					>
						<input name="carrier" placeholder="Carrier (e.g. Canada Post)" class="w-full rounded border border-ink-200 px-2 py-1.5" />
						<input name="trackingNumber" placeholder="Tracking number" class="w-full rounded border border-ink-200 px-2 py-1.5" />
						<input name="trackingUrl" type="url" placeholder="Tracking link (optional)" class="w-full rounded border border-ink-200 px-2 py-1.5" />
						<button disabled={submitting} class="w-full rounded bg-ink-900 px-3 py-2 font-medium text-white disabled:opacity-50">
							{submitting ? 'Saving…' : 'Mark shipped'}
						</button>
						<p class="text-xs text-ink-600">
							{data.emailEnabled
								? 'The customer is emailed their tracking details.'
								: 'Email is off (no RESEND_API_KEY) — the customer will not be notified.'}
						</p>
					</form>
				{:else}
					<p class="text-ink-600">Only paid orders can ship.</p>
				{/if}
				{#if form?.reason}
					<p class="mt-2 text-red-700" role="alert">{REASONS[form.reason] ?? form.reason}</p>
				{/if}
			</section>
		</aside>
	</div>
</div>
