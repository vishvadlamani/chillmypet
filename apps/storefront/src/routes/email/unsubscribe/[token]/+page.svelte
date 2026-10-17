<script lang="ts">
	import { page } from '$app/state';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	let status = $state<'idle' | 'busy' | 'done' | 'failed'>('idle');

	async function unsubscribe() {
		status = 'busy';
		try {
			const res = await fetch('/api/email/unsubscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: data.token })
			});
			status = res.ok ? 'done' : 'failed';
		} catch {
			status = 'failed';
		}
	}
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
	<title>{t('recovery.unsubscribeTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-4 py-10">
	<section class="mx-auto max-w-xl py-16 text-center">
		<h1 class="text-2xl font-semibold tracking-tight">{t('recovery.unsubscribeTitle')}</h1>
		{#if !data.valid}
			<p class="mt-4 text-ink-600">{t('recovery.unsubscribeInvalid')}</p>
		{:else if status === 'done'}
			<p class="mt-4 text-ink-600" role="status">{t('recovery.unsubscribed')}</p>
		{:else}
			<p class="mt-4 text-ink-600">{t('recovery.unsubscribeBody')}</p>
			<button
				type="button"
				class="mt-8 inline-block rounded-xl bg-ink-900 px-6 py-3 font-medium text-white disabled:opacity-60"
				disabled={status === 'busy'}
				onclick={unsubscribe}
			>
				{t('recovery.unsubscribeButton')}
			</button>
			{#if status === 'failed'}
				<p class="mt-4 text-red-700" role="alert">{t('recovery.unsubscribeFailed')}</p>
			{/if}
		{/if}
		<p class="mt-10"><a href="/" class="underline text-ink-600">{t('recovery.backToShop')}</a></p>
	</section>
</div>
