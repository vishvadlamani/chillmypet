<script lang="ts">
	import { page } from '$app/state';
	import ProductImage from '$lib/components/ProductImage.svelte';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
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

<!-- The whole catalogue, hero included. `#shop` is where the header's Shop link
     points: it used to be hard-coded to the life jacket, which stops being a
     shop the moment there are two things in it. -->
{#if data.products.length > 1}
	<section id="shop" class="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20">
		<h2 class="text-2xl font-semibold tracking-tight">{t('nav.shop')}</h2>
		<ul class="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.products as product (product.slug)}
				<li>
					<a href="/products/{product.slug}" class="group block">
						<div class="overflow-hidden rounded-2xl border border-ink-200">
							<ProductImage
								src={product.imageUrl}
								hex="#1e4e8c"
								label={product.title}
								class="aspect-square w-full transition group-hover:scale-105"
							/>
						</div>
						<h3 class="mt-4 font-medium">{product.title}</h3>
						<p class="mt-1 text-ink-600">
							{formatMoney(product.priceCents, locale, product.currency)}
							{#if !product.inStock}
								<span class="ml-2 text-sm">{t('product.soldOut')}</span>
							{/if}
						</p>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
