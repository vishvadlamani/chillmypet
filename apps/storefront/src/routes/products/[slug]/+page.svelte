<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toAmount } from 'ecomwithai/marketing';
	import Faq from '$lib/components/Faq.svelte';
	import ProductImage from '$lib/components/ProductImage.svelte';
	import { track } from '$lib/analytics/pixel';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	// Positional options: this catalogue is Colour then Size. The framework does
	// not know that, which is the point — a different store orders them its way.
	let colours = $derived(data.product.options[0]?.values ?? []);
	let sizes = $derived(data.product.options[1]?.values ?? []);

	type SizeRow = {
		size: string;
		chestMinCm: number;
		chestMaxCm: number;
		weightMinKg: number;
		weightMaxKg: number;
	};
	let sizeChart = $derived((data.product.metafields['specs.size_chart'] ?? []) as SizeRow[]);
	let faq = $derived((data.product.metafields['content.faq'] ?? []) as { q: string; a: string }[]);
	let benefits = $derived(
		(data.product.metafields['content.benefits'] ?? []) as { title: string; body: string }[]
	);

	// Defaults are computed, not assigned by an effect: effects don't run during
	// SSR, so starting these empty rendered the page with no variant selected —
	// which reads as `inStock === false` and shipped "Sold out" to anyone seeing
	// the HTML before hydration, crawlers and no-JS visitors included.
	const firstValue = (values: { value: string }[]) => values[0]?.value ?? '';

	// Colour order is merchandising, so the first one always wins. Size is not:
	// defaulting to M when M happens to be out of stock in that colour presents
	// a fully stocked product as sold out, so fall through to a size that is
	// actually buyable before giving up.
	function preferredSize(colour: string, values: { value: string }[]) {
		const stocked = (size: string) => (variantFor(colour, size)?.stock ?? 0) > 0;
		if (stocked('M')) return 'M';
		const available = values.find((s) => stocked(s.value));
		if (available) return available.value;
		return values.some((s) => s.value === 'M') ? 'M' : firstValue(values);
	}

	// Capturing only the initial value is the intent — these are writable
	// selections bound to the radios, and the effect below re-anchors them when
	// `data` changes on navigation.
	// svelte-ignore state_referenced_locally
	let selectedColour = $state(firstValue(data.product.options[0]?.values ?? []));
	// svelte-ignore state_referenced_locally
	let selectedSize = $state(
		preferredSize(
			firstValue(data.product.options[0]?.values ?? []),
			data.product.options[1]?.values ?? []
		)
	);
	let quantity = $state(1);
	let added = $state(false);

	// Re-anchor when the product changes under us on client-side navigation.
	$effect(() => {
		if (!colours.some((c) => c.value === selectedColour)) {
			selectedColour = firstValue(colours);
		}
		if (!sizes.some((s) => s.value === selectedSize)) {
			selectedSize = preferredSize(selectedColour, sizes);
		}
	});

	function variantFor(colour: string, size: string) {
		return data.product.variants.find(
			(v) => v.options[0] === colour && v.options[1] === size
		);
	}

	let selectedVariant = $derived(variantFor(selectedColour, selectedSize));
	let inStock = $derived((selectedVariant?.stock ?? 0) > 0);
	let activeColour = $derived(colours.find((c) => c.value === selectedColour));
	let activeHex = $derived(activeColour?.swatchHex ?? '#1e4e8c');
	let activeImage = $derived(activeColour?.imageUrl ?? null);

	let colourLabel = $derived(
		selectedColour ? t(`product.colors.${selectedColour}` as never) : ''
	);

	let savePercent = $derived(
		data.product.compareAtCents
			? Math.round((1 - data.product.priceCents / data.product.compareAtCents) * 100)
			: 0
	);

	$effect(() => {
		const slug = data.product.slug;
		track('ViewContent', {
			content_type: 'product',
			content_ids: [slug],
			currency: data.product.currency,
			value: toAmount(data.product.priceCents)
		});
	});

	function addToCart() {
		if (!selectedVariant || !inStock) return;
		cart.add(
			{
				variantId: selectedVariant.id,
				slug: data.product.slug,
				colour: selectedColour,
				size: selectedSize,
				unitPriceCents: selectedVariant.priceCents
			},
			quantity
		);

		track('AddToCart', {
			content_type: 'product',
			content_ids: [selectedVariant.sku],
			contents: [
				{ id: selectedVariant.sku, quantity, item_price: selectedVariant.priceCents / 100 }
			],
			num_items: quantity,
			currency: data.product.currency,
			value: toAmount(selectedVariant.priceCents * quantity)
		});

		added = true;
		setTimeout(() => (added = false), 2000);
	}

	function buyNow() {
		addToCart();
		goto('/checkout');
	}

	const cm = (value: number) => `${value} cm`;
	const inches = (value: number) => `${Math.round(value / 2.54)}"`;
	const kg = (value: number) => `${value} kg`;
	const lb = (value: number) => `${Math.round(value * 2.205)} lb`;
</script>

<svelte:head>
	<title>{data.product.title} · {t('common.brand')}</title>
	<meta name="description" content={data.product.description ?? ''} />
</svelte:head>

<article class="mx-auto max-w-6xl px-4 pt-10 pb-28 lg:pb-10">
	<div class="grid gap-10 lg:grid-cols-2 lg:gap-16">
		<!-- Gallery -->
		<div>
			<div class="overflow-hidden rounded-2xl border border-ink-200">
				<ProductImage
					src={activeImage}
					hex={activeHex}
					loading="eager"
					label={t('product.galleryAlt', {
						product: data.product.title,
						colour: colourLabel,
						index: 1
					})}
					class="aspect-square w-full"
				/>
			</div>

			<ul class="mt-3 flex flex-wrap gap-2">
				{#each colours as colour (colour.value)}
					<li>
						<button
							type="button"
							onclick={() => (selectedColour = colour.value)}
							aria-label={t(`product.colors.${colour.value}` as never)}
							aria-current={colour.value === selectedColour ? 'true' : undefined}
							class="overflow-hidden rounded-lg border transition
								{colour.value === selectedColour
								? 'border-ink-900 ring-2 ring-ink-900/15'
								: 'border-ink-200 hover:border-ink-400'}"
						>
							<ProductImage
								src={colour.imageUrl}
								hex={colour.swatchHex ?? '#1e4e8c'}
								label=""
								class="size-16"
							/>
						</button>
					</li>
				{/each}
			</ul>
		</div>

		<!-- Buy box -->
		<div>
			<h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">{data.product.title}</h1>
			{#if data.product.subtitle}
				<p class="mt-2 text-lg text-ink-600">{data.product.subtitle}</p>
			{/if}

			<div class="mt-5 flex flex-wrap items-baseline gap-3">
				<span class="text-3xl font-semibold">
					{formatMoney(data.product.priceCents, locale, data.product.currency)}
				</span>
				{#if data.product.compareAtCents}
					<span class="text-lg text-ink-400 line-through">
						{formatMoney(data.product.compareAtCents, locale, data.product.currency)}
					</span>
					<span class="rounded-full bg-coral-500 px-2.5 py-1 text-xs font-semibold text-white">
						{t('common.save', { percent: savePercent })}
					</span>
				{/if}
			</div>

			{#if data.product.description}
				<p class="mt-5 text-ink-600">{data.product.description}</p>
			{/if}

			{#if benefits.length}
				<ul class="mt-6 space-y-3">
					{#each benefits as benefit (benefit.title)}
						<li class="flex gap-3">
							<span class="mt-0.5 text-tide-600" aria-hidden="true">✓</span>
							<span class="text-sm">
								<span class="font-medium">{benefit.title}.</span>
								<span class="text-ink-600">{benefit.body}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			<!-- Colour -->
			<fieldset class="mt-8">
				<legend class="text-sm font-medium">
					{t('product.colorLabel')}<span class="ms-2 font-normal text-ink-400">{colourLabel}</span>
				</legend>
				<div class="mt-3 flex flex-wrap gap-2">
					{#each colours as colour (colour.value)}
						<label class="cursor-pointer">
							<input
								type="radio"
								name="colour"
								class="peer sr-only"
								value={colour.value}
								bind:group={selectedColour}
							/>
							<span
								class="block size-9 rounded-full border border-ink-200 ring-offset-2 transition peer-checked:ring-2 peer-checked:ring-ink-900 peer-focus-visible:ring-2 peer-focus-visible:ring-tide-500"
								style="background-color: {colour.swatchHex}"
							></span>
							<span class="sr-only">{t(`product.colors.${colour.value}` as never)}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<!-- Size -->
			<fieldset class="mt-7">
				<legend class="text-sm font-medium">{t('product.sizeLabel')}</legend>
				<div class="mt-3 flex flex-wrap gap-2">
					{#each sizes as size (size.value)}
						{@const variant = variantFor(selectedColour, size.value)}
						{@const available = (variant?.stock ?? 0) > 0}
						<label class:cursor-pointer={available} class:cursor-not-allowed={!available}>
							<input
								type="radio"
								name="size"
								class="peer sr-only"
								value={size.value}
								disabled={!available}
								bind:group={selectedSize}
							/>
							<span
								class="block min-w-14 rounded-lg border px-4 py-2 text-center text-sm font-medium transition
									peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white
									peer-focus-visible:ring-2 peer-focus-visible:ring-tide-500
									{available
									? 'border-ink-200 hover:border-ink-400'
									: 'border-ink-100 text-ink-200 line-through'}"
							>
								{size.label ?? size.value}
							</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<!-- Quantity + actions -->
			<div class="mt-7 flex flex-wrap items-end gap-4">
				<label class="block">
					<span class="text-sm font-medium">{t('product.quantityLabel')}</span>
					<input
						type="number"
						min="1"
						max="10"
						bind:value={quantity}
						class="mt-2 block w-24 rounded-lg border border-ink-200 px-3 py-2.5"
					/>
				</label>
			</div>

			<div class="mt-5 flex flex-col gap-3 sm:flex-row">
				<button
					type="button"
					onclick={addToCart}
					disabled={!inStock}
					class="flex-1 rounded-xl border border-ink-900 px-6 py-3.5 font-medium transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:border-ink-200 disabled:text-ink-400 disabled:hover:bg-transparent"
				>
					{#if !inStock}
						{t('product.soldOut')}
					{:else if added}
						✓ {t('product.added')}
					{:else}
						{t('product.addToCart')}
					{/if}
				</button>
				<button
					type="button"
					onclick={buyNow}
					disabled={!inStock}
					class="flex-1 rounded-xl bg-tide-600 px-6 py-3.5 font-medium text-white transition hover:bg-tide-700 disabled:cursor-not-allowed disabled:bg-ink-200"
				>
					{t('product.buyNow')}
				</button>
			</div>

			<p class="mt-4 text-sm text-ink-600">
				{#if !inStock}
					{t('product.outOfStockVariant')}
				{:else if selectedVariant && selectedVariant.stock <= 5}
					{t('product.lowStock', { count: selectedVariant.stock })}
				{:else}
					{t('product.inStock')}
				{/if}
			</p>

			<!-- The three objections that stop a first-time buyer: cost of
			     shipping, risk of the wrong size, and handing card details to a
			     shop they have never used. -->
			<ul class="mt-6 grid grid-cols-3 gap-2 border-y border-ink-200 py-4 text-center text-xs text-ink-600">
				<li>{t('product.trustShipping')}</li>
				<li>{t('product.trustReturns')}</li>
				<li>{t('product.trustSecure')}</li>
			</ul>

			<div class="mt-6 space-y-4 text-sm">
				<div>
					<h2 class="font-medium">{t('product.reassureShippingTitle')}</h2>
					<p class="mt-1 text-ink-600">
						{t('product.reassureShippingBody')}
						<a class="underline" href="/policies/shipping">{t('product.reassureMore')}</a>
					</p>
				</div>
				<div>
					<h2 class="font-medium">{t('product.reassureReturnsTitle')}</h2>
					<p class="mt-1 text-ink-600">
						{t('product.reassureReturnsBody')}
						<a class="underline" href="/policies/refunds">{t('product.reassureMore')}</a>
					</p>
				</div>
			</div>

			<!-- Size chart -->
			{#if sizeChart.length}
				<section class="mt-10">
					<h2 class="text-sm font-semibold">{t('product.sizeChartTitle')}</h2>
					<p class="mt-1 text-sm text-ink-600">{t('product.sizeChartHint')}</p>
					<div class="mt-4 overflow-x-auto">
						<table class="w-full min-w-md border-collapse text-sm">
							<thead>
								<tr class="border-b border-ink-200 text-left text-ink-600">
									<th scope="col" class="py-2 pe-4 font-medium">
										{t('product.sizeChartColumns.size')}
									</th>
									<th scope="col" class="py-2 pe-4 font-medium">
										{t('product.sizeChartColumns.chest')}
									</th>
									<th scope="col" class="py-2 font-medium">
										{t('product.sizeChartColumns.weight')}
									</th>
								</tr>
							</thead>
							<tbody>
								{#each sizeChart as row (row.size)}
									<tr class="border-b border-ink-100">
										<th scope="row" class="py-2.5 pe-4 text-left font-medium">{row.size}</th>
										<td class="py-2.5 pe-4 text-ink-600">
											{cm(row.chestMinCm)}–{cm(row.chestMaxCm)}
											<span class="text-ink-400">
												({inches(row.chestMinCm)}–{inches(row.chestMaxCm)})
											</span>
										</td>
										<td class="py-2.5 text-ink-600">
											{kg(row.weightMinKg)}–{kg(row.weightMaxKg)}
											<span class="text-ink-400">
												({lb(row.weightMinKg)}–{lb(row.weightMaxKg)})
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</section>
			{/if}
		</div>
	</div>

	<!-- FAQ -->
	{#if faq.length}
		<section class="mt-20 max-w-3xl">
			<h2 class="text-2xl font-semibold tracking-tight">{t('product.faqTitle')}</h2>
			<div class="mt-6">
				<Faq items={faq} />
			</div>
		</section>
	{/if}
</article>

<!-- Phone-only buy bar. The desktop layout keeps the buy box beside the gallery,
     but on a phone everything is one column and the button is far above the size
     chart and FAQ people scroll through before deciding. -->
<div
	class="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden"
>
	<div class="mx-auto flex max-w-6xl items-center gap-3">
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{data.product.title}</p>
			<p class="text-sm text-ink-600">
				{formatMoney(data.product.priceCents, locale, data.product.currency)}
				<span class="ms-1 text-ink-400">{colourLabel} · {selectedSize}</span>
			</p>
		</div>
		<button
			type="button"
			onclick={addToCart}
			disabled={!inStock}
			class="shrink-0 rounded-xl bg-tide-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-tide-700 disabled:cursor-not-allowed disabled:bg-ink-200"
		>
			{inStock ? t('product.stickyAdd') : t('product.soldOut')}
		</button>
	</div>
</div>
