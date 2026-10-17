<script lang="ts">
	import { page } from '$app/state';
	import Checkout from '$lib/components/Checkout.svelte';
	import { countryOptions } from '$lib/countries';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { sessionFunnelState } from '$lib/store/session-state.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	// The store sells to the US, and a blank country select is a scroll through
	// two hundred names on a phone. Anyone elsewhere picks their own, and an
	// autocompleted address overwrites it.
	const { bag, state } = sessionFunnelState({
		country:
			countryOptions(page.data.locale ?? defaultLocale).find((c) => c.code === 'US')?.name ?? ''
	});
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

<Checkout {data} {form} {bag} funnelState={state} />
