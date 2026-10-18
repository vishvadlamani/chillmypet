<script lang="ts">
	import { page } from '$app/state';
	import Collection from '$lib/components/Collection.svelte';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let count = $derived(data.products.length);
</script>

<svelte:head>
	<title>{t('nav.catalog')} · {t('common.brand')}</title>
	<meta
		name="description"
		content="Every ChillMyPet product: Christmas costumes, hoodies and life jackets."
	/>
</svelte:head>

<Collection
	eyebrow={t('nav.catalog')}
	title={t('nav.allProducts')}
	lead="{count} {count === 1 ? 'product' : 'products'} · Free US shipping, 30-day returns."
	products={data.products}
	empty="New products are on their way."
/>
