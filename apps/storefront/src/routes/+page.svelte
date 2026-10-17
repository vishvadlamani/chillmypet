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
	<title>{t('common.brand')} · Clothes for small dogs</title>
	<meta
		name="description"
		content="Christmas costumes, hoodies and life jackets for small dogs. Free US shipping and 30-day returns."
	/>
	{#if lead?.image}
		<meta property="og:image" content={new URL(lead.image, page.url).href} />
	{/if}
</svelte:head>

<Collection
	eyebrow={t('common.brand')}
	title="Little outfits for small dogs."
	lead="Christmas costumes, hoodies and life jackets. Free US shipping, 30-day returns."
	products={data.products}
	empty="New products are on their way."
>
	<p class="more">
		<a href="/christmas">{t('nav.christmas')}</a>
		<a href="/catalog">{t('nav.allProducts')}</a>
	</p>
</Collection>

<style>
	.more {
		margin: 24px 0 0;
		display: flex;
		justify-content: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.more a {
		display: inline-block;
		padding: 11px 22px;
		border: 1px solid var(--tree-green);
		border-radius: 999px;
		color: var(--tree-green);
		font-weight: 600;
		font-size: 15px;
		text-decoration: none;
	}
	.more a:hover {
		background: var(--tree-green);
		color: #fff;
	}
</style>
