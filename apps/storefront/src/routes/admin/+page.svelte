<script lang="ts">
	import { money, statusLabel, when } from './format';

	let { data } = $props();
</script>

<svelte:head>
	<title>Orders · Admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-8">
	<header class="mb-6 flex flex-wrap items-center gap-4">
		<h1 class="text-2xl font-semibold">Orders</h1>
		<nav class="flex gap-1 text-sm" aria-label="Order views">
			<a
				href="/admin"
				class="rounded px-3 py-1.5 {data.view === 'to-ship' && !data.q ? 'bg-ink-900 text-white' : 'hover:bg-ink-100'}"
				>To ship</a
			>
			<a
				href="/admin?view=all"
				class="rounded px-3 py-1.5 {data.view === 'all' && !data.q ? 'bg-ink-900 text-white' : 'hover:bg-ink-100'}"
				>All orders</a
			>
		</nav>
		<form method="GET" action="/admin" class="ms-auto flex gap-2">
			<label class="sr-only" for="q">Order number or email</label>
			<input
				id="q"
				name="q"
				value={data.q}
				placeholder="Order number or email"
				class="w-64 rounded border border-ink-200 px-3 py-1.5 text-sm"
			/>
			<button class="rounded bg-ink-900 px-3 py-1.5 text-sm text-white">Search</button>
		</form>
	</header>

	{#if data.customer}
		<section class="mb-6 rounded-lg border border-ink-200 p-4 text-sm">
			<h2 class="mb-2 font-semibold">Customer</h2>
			<dl class="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
				<div><dt class="text-ink-600">Name</dt><dd>{data.customer.name || '—'}</dd></div>
				<div><dt class="text-ink-600">Email</dt><dd>{data.customer.email}</dd></div>
				<div><dt class="text-ink-600">Phone</dt><dd>{data.customer.phone ?? '—'}</dd></div>
				<div>
					<dt class="text-ink-600">Orders · spent</dt>
					<dd>{data.customer.ordersCount} · {money(data.customer.totalSpentCents, data.currency)}</dd>
				</div>
			</dl>
		</section>
	{/if}

	{#if data.orders.length === 0}
		<p class="rounded-lg border border-dashed border-ink-200 p-8 text-center text-ink-600">
			{#if data.q}No orders match “{data.q}”.{:else if data.view === 'to-ship'}Nothing to ship — every paid order is out the door.{:else}No orders yet.{/if}
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-ink-200">
			<table class="w-full text-left text-sm">
				<thead class="bg-ink-50 text-ink-600">
					<tr>
						<th class="px-3 py-2 font-medium">Order</th>
						<th class="px-3 py-2 font-medium">Placed</th>
						<th class="px-3 py-2 font-medium">Customer</th>
						<th class="px-3 py-2 font-medium">Items</th>
						<th class="px-3 py-2 text-right font-medium">Total</th>
						<th class="px-3 py-2 font-medium">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each data.orders as order (order.orderNumber)}
						<tr class="border-t border-ink-100 hover:bg-ink-50">
							<td class="px-3 py-2 font-medium">
								<a class="underline-offset-2 hover:underline" href="/admin/orders/{order.orderNumber}"
									>{order.orderNumber}</a
								>
							</td>
							<td class="px-3 py-2 whitespace-nowrap text-ink-600">{when(order.createdAt)}</td>
							<td class="px-3 py-2">
								<div>{order.name}</div>
								<div class="text-ink-600">{order.email} · {order.country}</div>
							</td>
							<td class="px-3 py-2">{order.units}</td>
							<td class="px-3 py-2 text-right">{money(order.totalCents, order.currency)}</td>
							<td class="px-3 py-2">
								{#if order.shippedAt}
									<span class="rounded bg-tide-100 px-2 py-0.5 text-tide-700">Shipped</span>
								{:else}
									<span class="rounded bg-ink-100 px-2 py-0.5">{statusLabel(order.status)}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if data.view === 'all' && !data.q && (data.page > 1 || data.hasMore)}
		<nav class="mt-4 flex justify-between text-sm" aria-label="Pages">
			{#if data.page > 1}<a class="underline" href="/admin?view=all&page={data.page - 1}">← Newer</a>{:else}<span></span>{/if}
			{#if data.hasMore}<a class="underline" href="/admin?view=all&page={data.page + 1}">Older →</a>{/if}
		</nav>
	{/if}
</div>
