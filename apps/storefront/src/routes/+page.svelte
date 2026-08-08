<script lang="ts">
	import { page } from '$app/state';
	import ProductImage from '$lib/components/ProductImage.svelte';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let firstImage = $derived(data.hero?.media[0]?.url ?? null);
</script>

<svelte:head>
	<title>{t('common.brand')}</title>
	<meta name="description" content={data.hero?.description ?? ''} />
</svelte:head>

{#if data.hero}
	<section class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-16">
		<div>
			<h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">
				{data.hero.subtitle ?? data.hero.title}
			</h1>
			<p class="mt-5 text-lg text-ink-600">{data.hero.description}</p>
			<a
				href="/products/{data.hero.slug}"
				class="mt-8 inline-block rounded-xl bg-tide-600 px-7 py-3.5 font-medium text-white transition hover:bg-tide-700"
			>
				{data.hero.title}
			</a>
		</div>
		<div class="overflow-hidden rounded-2xl border border-ink-200">
			<ProductImage
				src={firstImage}
				hex="#1e4e8c"
				loading="eager"
				label={data.hero.title}
				class="aspect-square w-full"
			/>
		</div>
	</section>
{:else}
	<section class="mx-auto max-w-6xl px-4 py-24 text-center text-ink-600">
		<p>{t('cart.empty')}</p>
	</section>
{/if}
