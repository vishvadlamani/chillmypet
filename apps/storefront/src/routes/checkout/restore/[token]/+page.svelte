<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	onMount(() => {
		if (data.lines.length === 0) return;
		cart.replace(data.lines);
		// The checkout's contact fields read this, so the email they gave is
		// already filled in when they arrive. Same key the checkout writes.
		try {
			const state = JSON.parse(sessionStorage.getItem('store-state') ?? '{}');
			if (!state.email) state.email = data.email;
			if (!state.fullName && data.firstName) state.fullName = data.firstName;
			sessionStorage.setItem('store-state', JSON.stringify(state));
		} catch {
			// Blocked storage: the cart is restored, the email is typed again.
		}
		goto('/checkout', { replaceState: true });
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<section class="mx-auto max-w-xl py-16 text-center">
		{#if data.lines.length > 0}
			<p class="text-ink-600">{t('recovery.restoring')}</p>
		{:else}
			<h1 class="text-2xl font-semibold tracking-tight">{t('recovery.restoreMissing')}</h1>
			<a href="/" class="mt-8 inline-block rounded-xl bg-ink-900 px-6 py-3 font-medium text-white">
				{t('recovery.backToShop')}
			</a>
		{/if}
	</section>
</div>
