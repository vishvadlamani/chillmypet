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

	// The first two entries answer delivery and sizing — the two questions asked
	// while deciding, not after. They sit under the button; the rest go below.
	let buyBoxFaq = $derived(faq.slice(0, 2));
	let restFaq = $derived(faq.slice(2));

	let sizeChartDialog = $state<HTMLDialogElement | null>(null);

	// The sticky bar is a second copy of the CTA, so it only earns its space once
	// the real one has scrolled away. Two identical buttons on screen at once
	// reads as a mistake.
	let buyButton = $state<HTMLButtonElement | null>(null);
	let buyButtonVisible = $state(true);
	$effect(() => {
		if (!buyButton) return;
		const observer = new IntersectionObserver(
			([entry]) => (buyButtonVisible = entry.isIntersecting),
			{ rootMargin: '-8px' }
		);
		observer.observe(buyButton);
		return () => observer.disconnect();
	});

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
	// One per add. Quantity is adjusted in the cart, which keeps the buy box to a
	// single decision: colour, size, buy.
	const quantity = 1;
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
				<legend class="text-sm font-medium">
					{t('product.sizeLabel')}<span class="ms-2 font-normal text-ink-400">{selectedSize}</span>
				</legend>
				<div class="mt-3 flex flex-wrap gap-2">
					{#each sizes as size (size.value)}
						{@const available = (variantFor(selectedColour, size.value)?.stock ?? 0) > 0}
						{@const offered = Boolean(variantFor(selectedColour, size.value))}
						<label class:opacity-40={!available} class="cursor-pointer">
							<input
								type="radio"
								name="size"
								class="peer sr-only"
								value={size.value}
								disabled={!available}
								bind:group={selectedSize}
							/>
							<span
								class="block min-w-14 rounded-lg border border-ink-200 px-4 py-2.5 text-center text-sm transition peer-checked:border-ink-900 peer-checked:bg-ink-900 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-tide-500"
								class:line-through={!offered}
							>
								{size.value}
							</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<!-- Size chart opens over the page rather than pushing the button down
			     the screen, which is what their layout does and why their CTA stays
			     within a thumb's reach on a phone. -->
			<button
				type="button"
				onclick={() => sizeChartDialog?.showModal()}
				class="mt-5 text-sm font-medium underline underline-offset-4"
			>
				{t('product.sizeChart')}
			</button>

			<button
				bind:this={buyButton}
				type="button"
				onclick={addToCart}
				disabled={!inStock}
				class="mt-6 w-full rounded-xl bg-tide-600 px-6 py-4 font-medium text-white transition hover:bg-tide-700 disabled:cursor-not-allowed disabled:bg-ink-200"
			>
				{#if !inStock}
					{t('product.soldOut')}
				{:else if added}
					✓ {t('product.added')}
				{:else}
					{t('product.addToCart')}
				{/if}
			</button>

			<p class="mt-3 text-sm text-ink-600">
				{#if !inStock}
					{t('product.outOfStockVariant')}
				{:else if selectedVariant && selectedVariant.stock <= 5}
					{t('product.lowStock', { count: selectedVariant.stock })}
				{:else}
					{t('product.inStock')}
				{/if}
			</p>

			{#if buyBoxFaq.length}
				<div class="mt-7">
					<Faq items={buyBoxFaq} />
				</div>
			{/if}
		</div>
	</div>

	<!-- Full-width band: the promise, then the detail. Theirs runs a lifestyle
	     image behind this; ours uses the product shot until real photography
	     lands. -->
	{#if data.product.subtitle}
		<section class="mt-16 overflow-hidden rounded-3xl bg-ink-50">
			<div class="grid items-center gap-8 lg:grid-cols-2">
				<ProductImage
					src={activeImage}
					hex={activeHex}
					label=""
					class="aspect-[4/3] w-full lg:aspect-square"
				/>
				<div class="px-6 pb-10 lg:px-10 lg:py-12">
					<h2 class="text-2xl font-semibold tracking-tight sm:text-3xl">
						{data.product.subtitle}
					</h2>
					{#if data.product.description}
						<p class="mt-4 text-ink-600">{data.product.description}</p>
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
				</div>
			</div>
		</section>
	{/if}

	<!-- FAQ -->
	{#if restFaq.length}
		<section class="mt-20 max-w-3xl">
			<h2 class="text-2xl font-semibold tracking-tight">{t('product.faqTitle')}</h2>
			<div class="mt-6">
				<Faq items={restFaq} />
			</div>
		</section>
	{/if}
</article>

<!-- Size chart, as a dialog. Native <dialog> gives focus trapping, Escape to
     close and inert background for free. -->
<dialog
	bind:this={sizeChartDialog}
	class="w-[min(34rem,calc(100vw-2rem))] rounded-2xl p-0 backdrop:bg-ink-900/40"
>
	<div class="p-6">
		<div class="flex items-start justify-between gap-4">
			<h2 class="text-lg font-semibold">{t('product.sizeChartTitle')}</h2>
			<button
				type="button"
				onclick={() => sizeChartDialog?.close()}
				class="-m-2 p-2 text-ink-400 hover:text-ink-900"
				aria-label={t('common.close')}
			>
				✕
			</button>
		</div>
		<p class="mt-1 text-sm text-ink-600">{t('product.sizeChartHint')}</p>

		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead class="border-b border-ink-200 text-ink-600">
					<tr>
						<th scope="col" class="py-2 pe-4 font-medium">{t('product.sizeChartColumns.size')}</th>
						<th scope="col" class="py-2 pe-4 font-medium">{t('product.sizeChartColumns.chest')}</th>
						<th scope="col" class="py-2 font-medium">{t('product.sizeChartColumns.weight')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-ink-200">
					{#each sizeChart as row (row.size)}
						<tr>
							<td class="py-2.5 pe-4 font-medium">{row.size}</td>
							<td class="py-2.5 pe-4 text-ink-600">
								{cm(row.chestMinCm)}–{cm(row.chestMaxCm)}
								<span class="text-ink-400">({inches(row.chestMinCm)}–{inches(row.chestMaxCm)})</span>
							</td>
							<td class="py-2.5 text-ink-600">
								{kg(row.weightMinKg)}–{kg(row.weightMaxKg)}
								<span class="text-ink-400">({lb(row.weightMinKg)}–{lb(row.weightMaxKg)})</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</dialog>

<!-- Phone-only buy bar. The desktop layout keeps the buy box beside the gallery,
     but on a phone everything is one column and the button is far above the size
     chart and FAQ people scroll through before deciding. -->
<div
	class="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur transition-transform duration-200 lg:hidden"
	class:translate-y-full={buyButtonVisible}
	aria-hidden={buyButtonVisible}
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
