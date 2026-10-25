<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	let { data } = $props();
	let starting = $state(false);
	let ready = $state(false);
	onMount(() => { ready = true; });
	async function start() {
		starting = true;
		cart.hydrate();
		cart.replace([{ variantId: data.variantId, slug: 'payment-test', colour: '', size: '', quantity: 1, unitPriceCents: 100 }]);
		await goto('/checkout');
	}
</script>

<svelte:head><title>$1.00 payment test · ChillMyPet</title><meta name="robots" content="noindex, nofollow" /></svelte:head>
<section class="mx-auto max-w-xl px-5 py-12">
	<h1 class="mb-4 text-3xl font-semibold">Try a $1.00 payment</h1>
	<p class="mb-6 text-lg">This uses the store’s checkout in Stripe’s sandbox. No real money moves and nothing is shipped.</p>
	<ol class="mb-6 list-decimal space-y-3 ps-6">
		<li>Use test contact and delivery details.</li>
		<li>For a successful card payment, enter <strong>4242 4242 4242 4242</strong>, a future expiry and any three-digit CVC.</li>
		<li>Complete the payment and check the receipt.</li>
	</ol>
	{#if data.metaReady}
		<p class="mb-6 rounded bg-green-50 p-4">Purchase tracking goes to Meta Test Events.</p>
	{:else}
		<p class="mb-6 rounded bg-amber-50 p-4">Payment testing is ready. Meta tracking stays off until its sandbox test-event code and access token are configured.</p>
	{/if}
	<button onclick={start} disabled={!ready || starting} class="min-h-12 w-full rounded-lg bg-emerald-900 px-6 py-4 text-lg font-semibold text-white disabled:opacity-60">{starting ? 'Opening checkout…' : 'Start $1.00 test'}</button>
</section>
