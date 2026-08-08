<script lang="ts">
	import { page } from '$app/state';
	import ProductImage from '$lib/components/ProductImage.svelte';
	import { createTranslator, defaultLocale, pack } from '$lib/i18n';

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let hero = $derived(pack(locale).products['dog-life-jacket']);
</script>

<svelte:head>
	<title>{t('common.brand')}</title>
	<meta name="description" content={hero.description} />
</svelte:head>

<section class="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:gap-16">
	<div>
		<h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">{hero.tagline}</h1>
		<p class="mt-5 text-lg text-ink-600">{hero.description}</p>
		<a
			href="/products/dog-life-jacket"
			class="mt-8 inline-block rounded-xl bg-tide-600 px-7 py-3.5 font-medium text-white transition hover:bg-tide-700"
		>
			{hero.name}
		</a>
	</div>
	<div class="overflow-hidden rounded-2xl border border-ink-200">
		<ProductImage
			src="/products/dog-life-jacket/sailboat.jpg"
			hex="#1e4e8c"
			loading="eager"
			label={hero.name}
			class="aspect-square w-full"
		/>
	</div>
</section>
