<script lang="ts">
	import { page } from '$app/state';
	import Collection from '$lib/components/Collection.svelte';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let lead = $derived(data.products[0]);
</script>

<svelte:head>
	<title>Christmas for your pet · {t('common.brand')}</title>
	<meta
		name="description"
		content="Christmas costumes and hoodies for small pets. Free US shipping and 30-day returns."
	/>
	{#if lead?.image}
		<!-- Absolute: Facebook and Instagram resolve link previews from their own
		     servers, not from this page. -->
		<meta property="og:image" content={new URL(lead.image, page.url).href} />
	{/if}
</svelte:head>

<Collection
	eyebrow="The Christmas shop"
	title="Christmas, with the pet in it."
	lead="Costumes and hoodies for small pets. Free US shipping, 30-day returns."
	products={data.products}
	empty="The Christmas shop opens soon."
/>
