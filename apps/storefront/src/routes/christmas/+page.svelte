<script lang="ts">
	import { page } from '$app/state';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { photoSrcset } from '$lib/resized';
	import type { PageData } from './$types';
	import '$lib/styles/tree-theme.css';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let lead = $derived(data.products[0]);
</script>

<svelte:head>
	<title>Christmas for your dog · {t('common.brand')}</title>
	<meta
		name="description"
		content="Christmas costumes and hoodies for small dogs. Free US shipping and 30-day returns."
	/>
	<link
		href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
		rel="stylesheet"
	/>
	{#if lead?.image}
		<!-- Absolute: Facebook and Instagram resolve link previews from their own
		     servers, not from this page. -->
		<meta property="og:image" content={new URL(lead.image, page.url).href} />
	{/if}
</svelte:head>

<div class="tree-theme xmas">
	<!-- Short on purpose: an ad opens this on a phone, and the products'
	     photos and prices have to be on the first screen. -->
	<header class="intro">
		<p class="eyebrow">The Christmas shop</p>
		<h1>Christmas, with the dog in it.</h1>
		<p class="lead">Costumes and hoodies for small dogs. Free US shipping, 30-day returns.</p>
	</header>

	{#if data.products.length}
		<ul class="grid">
			{#each data.products as product, i (product.slug)}
				<li>
					<a class="card" href="/products/{product.slug}">
						<figure>
							{#if product.image}
								<img
									src={product.image}
									srcset={photoSrcset(product.image, 1200)}
									sizes="(min-width: 640px) 420px, 100vw"
									alt={product.alt}
									width="800"
									height="800"
									loading={i < 2 ? 'eager' : 'lazy'}
									decoding="async"
								/>
							{/if}
						</figure>
						<div class="body">
							<h2>{product.title}</h2>
							{#if product.subtitle}<p class="sub">{product.subtitle}</p>{/if}
							<p class="price">{product.price}</p>
							<p class="meta">
								<span class="swatches">
									{#each product.colours as colour (colour.label)}
										<span
											class="swatch"
											style:background={colour.hex ?? '#ccc'}
											title={colour.label}
										></span>
									{/each}
									<span class="sr-only">
										{product.colours.map((c) => c.label).join(', ')}
									</span>
								</span>
								{#if product.sizes}<span>Sizes {product.sizes}</span>{/if}
							</p>
							<span class="cta">{product.inStock ? 'Choose a size' : 'Sold out'}</span>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">The Christmas shop opens soon.</p>
	{/if}

	<!-- The same promises the product pages make, in fewer words. -->
	<ul class="promises">
		<li><strong>Free shipping</strong> to the US, with tracking</li>
		<li><strong>30 days</strong> to return or swap a size</li>
		<li><strong>A real inbox:</strong> contact@chillmypet.com</li>
	</ul>
</div>

<style>
	.xmas {
		max-width: 1100px;
		margin: 0 auto;
		padding: 20px 16px 8px;
		color: var(--tree-ink);
	}
	.intro {
		text-align: center;
		margin: 0 auto 18px;
		max-width: 620px;
	}
	.eyebrow {
		margin: 0 0 4px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 1.5px;
		text-transform: uppercase;
		color: var(--tree-red);
	}
	h1 {
		margin: 0;
		font-size: 26px;
		line-height: 1.2;
		font-weight: 700;
		letter-spacing: 0.4px;
	}
	.lead {
		margin: 6px 0 0;
		font-size: 14px;
		color: var(--tree-muted);
	}
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	@media (min-width: 640px) {
		.xmas {
			padding-top: 40px;
		}
		h1 {
			font-size: 36px;
		}
		.lead {
			font-size: 16px;
		}
		.intro {
			margin-bottom: 32px;
		}
		.grid {
			grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
			gap: 24px;
		}
	}
	.card {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--tree-card);
		border: 1px solid var(--tree-rule);
		border-radius: 14px;
		overflow: hidden;
		color: inherit;
		text-decoration: none;
		transition: box-shadow 0.15s ease;
	}
	.card:hover {
		box-shadow: 0 6px 24px rgb(36 59 49 / 0.12);
	}
	.card:focus-visible {
		outline: 2px solid var(--tree-green);
		outline-offset: 2px;
	}
	figure {
		margin: 0;
		aspect-ratio: 1 / 0.92;
		background: var(--tree-tint);
	}
	figure img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px 16px;
		flex: 1;
	}
	h2 {
		margin: 0;
		font-size: 18px;
		line-height: 1.3;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 14px;
		color: var(--tree-muted);
	}
	.price {
		margin: 4px 0 0;
		font-size: 18px;
		font-weight: 700;
		color: var(--tree-green);
	}
	.meta {
		margin: 0 0 12px;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 13px;
		color: var(--tree-muted);
	}
	.swatches {
		display: inline-flex;
		gap: 4px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 999px;
		border: 1px solid rgb(0 0 0 / 0.15);
	}
	.cta {
		display: block;
		text-align: center;
		background: var(--tree-green);
		color: #fff;
		font-weight: 600;
		font-size: 15px;
		border-radius: 999px;
		padding: 12px 16px;
		margin-top: auto;
	}
	.card:hover .cta {
		background: var(--tree-green-deep);
	}
	/* On a phone each card is a row, photo beside the words, so the first
	   screen shows more than one product and every one with its price. */
	@media (max-width: 639px) {
		.card {
			flex-direction: row;
		}
		figure {
			flex: 0 0 42%;
			aspect-ratio: auto;
			min-height: 170px;
		}
		.body {
			padding: 12px 12px 12px 14px;
		}
		h2 {
			font-size: 16px;
		}
		.sub {
			font-size: 13px;
		}
		.price {
			font-size: 17px;
		}
		.meta {
			flex-wrap: wrap;
			gap: 8px;
		}
		.cta {
			font-size: 14px;
			padding: 9px 12px;
		}
	}
	.empty {
		text-align: center;
		color: var(--tree-muted);
		padding: 40px 0;
	}
	.promises {
		list-style: none;
		margin: 28px 0 0;
		padding: 18px 0 0;
		border-top: 1px solid var(--tree-rule);
		display: grid;
		gap: 8px;
		font-size: 14px;
		color: var(--tree-muted);
		text-align: center;
	}
	.promises strong {
		color: var(--tree-ink);
	}
	@media (min-width: 640px) {
		.promises {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
