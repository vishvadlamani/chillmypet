<script lang="ts">
	import { page } from '$app/state';
	import Collection from '$lib/components/Collection.svelte';
	import { createTranslator, defaultLocale } from '$lib/i18n';
	import { photoSrcset } from '$lib/resized';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	/**
	 * The shop window: two small dogs in the tree costume, red and green, by
	 * a Christmas tree. One of the costume page's lifestyle shots (see
	 * AGENTS.md, Content and assets), AI-styled, and captioned as such here as
	 * it is there.
	 */
	const HERO = {
		src: '/products/dog-christmas-costume/duo.jpg',
		width: 1254,
		height: 836,
		alt: 'Two small dogs by a Christmas tree, one in the green tree costume and one in the red'
	};
</script>

<svelte:head>
	<title>{t('common.brand')} · Clothes for small dogs</title>
	<meta
		name="description"
		content="Christmas costumes, hoodies and life jackets for small dogs. Free US shipping and 30-day returns."
	/>
	<!-- Absolute: Facebook and Instagram resolve link previews from their own
	     servers, not from this page. -->
	<meta property="og:image" content={new URL(HERO.src, page.url).href} />
</svelte:head>

<section class="tree-theme hero">
	<div class="hero-text">
		<p class="eyebrow">{t('common.brand')} · Christmas</p>
		<h1>Little outfits for small dogs.</h1>
		<p class="lead">
			Christmas costumes and hoodies that make the photo, made for small dogs. Free US
			shipping, and 30 days to change your mind.
		</p>
		<div class="actions">
			{#if page.data.christmasShop}
				<a class="primary" href="/christmas">{t('nav.christmas')}</a>
			{/if}
			<a class="secondary" href="/catalog">{t('nav.allProducts')}</a>
		</div>
	</div>
	<figure>
		<img
			src={HERO.src}
			srcset={photoSrcset(HERO.src, HERO.width)}
			sizes="(min-width: 900px) 640px, 100vw"
			alt={HERO.alt}
			width={HERO.width}
			height={HERO.height}
			fetchpriority="high"
		/>
		<figcaption>AI-styled image</figcaption>
	</figure>
</section>

<Collection
	eyebrow="The shop"
	title="Dressed for the holidays."
	lead="Choose the outfit, then the colour and size on its page."
	level="h2"
	products={data.products}
	empty="New products are on their way."
/>

<style>
	.hero {
		max-width: 1176px;
		margin: 0 auto;
		padding: 20px 16px 8px;
		display: grid;
		gap: 20px;
		align-items: center;
		/* The section carries `.tree-theme` for its colours, not its page bg. */
		background: transparent;
	}
	.hero figure {
		margin: 0;
		order: -1;
		border-radius: 14px;
		overflow: hidden;
		background: var(--tree-tint);
		position: relative;
	}
	.hero img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1254 / 836;
		object-fit: cover;
	}
	figcaption {
		position: absolute;
		right: 10px;
		bottom: 8px;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgb(36 59 49 / 0.55);
		color: #fff;
		font-size: 11px;
		letter-spacing: 0.4px;
	}
	.eyebrow {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 1.5px;
		text-transform: uppercase;
		color: var(--tree-red);
	}
	.hero-text h1 {
		margin: 0;
		font-size: 30px;
		line-height: 1.15;
		font-weight: 700;
		letter-spacing: -0.3px;
		color: var(--tree-green);
	}
	.lead {
		margin: 10px 0 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--tree-muted);
	}
	.actions {
		margin-top: 18px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.actions a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0 26px;
		border-radius: 999px;
		font-weight: 600;
		font-size: 15px;
		letter-spacing: 0.4px;
		border: 1px solid var(--tree-green);
	}
	.primary {
		background: var(--tree-green);
		color: #fff;
	}
	.primary:hover {
		background: var(--tree-green-deep);
	}
	.secondary {
		color: var(--tree-green);
	}
	.secondary:hover {
		background: var(--tree-tint);
	}
	@media (min-width: 900px) {
		.hero {
			grid-template-columns: 5fr 7fr;
			gap: 56px;
			padding-top: 48px;
			padding-bottom: 24px;
		}
		.hero figure {
			order: 0;
		}
		.hero-text h1 {
			font-size: 46px;
		}
		.lead {
			font-size: 16px;
		}
		.actions {
			margin-top: 26px;
		}
	}
</style>
