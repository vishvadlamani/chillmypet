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
	 * The shop window: three outfits as they are worn, a large photo and
	 * two small ones, rather than one staged scene. The tabby in the green
	 * costume leads, as on the costume's page. Its "AI-styled image" label came
	 * off on the owner's call (2026-10-18), as did the two-dog scene that stood
	 * here first (2026-10-17). The bulldog in the Santa costume took the
	 * third tile from the dog in the red tree costume on the owner's call
	 * (2026-10-19), so each tile shows a different outfit.
	 */
	const HERO = [
		{
			src: '/products/dog-christmas-costume/cat.jpg',
			href: '/products/christmas-tree-costume',
			alt: 'A tabby cat wearing the green Christmas tree costume on a rug'
		},
		{
			src: '/products/reindeer-dog-hoodie/worn-red.jpg',
			href: '/products/christmas-hoodie',
			alt: 'A small grey dog in the red reindeer hoodie by a Christmas tree'
		},
		{
			src: '/products/santa-pet-costume/dog.jpg',
			href: '/products/santa-costume-with-gift',
			alt: 'A French bulldog in the red Santa costume holding a gift'
		}
	];
</script>

<svelte:head>
	<title>{t('common.brand')} · Little outfits for little ones</title>
	<meta
		name="description"
		content="Christmas costumes, hoodies and life jackets. Free US shipping and 30-day returns."
	/>
	<!-- Absolute: Facebook and Instagram resolve link previews from their own
	     servers, not from this page. -->
	<meta property="og:image" content={new URL(HERO[0].src, page.url).href} />
</svelte:head>

<!-- The band runs the page's full width in the logo's teal; the hero inside
     keeps the page's width. -->
<div class="hero-band">
	<section class="tree-theme hero">
		<div class="hero-text">
			<p class="eyebrow">The Christmas collection</p>
			<h1>Little outfits for little ones.</h1>
			<p class="lead">
				Christmas costumes and hoodies, sized to fit. Free US shipping,
				and 30 days to change your mind.
			</p>
			<div class="actions">
				{#if page.data.christmasShop}
					<a class="primary" href="/christmas">{t('nav.christmas')}</a>
				{/if}
				<a class="secondary" href="/catalog">{t('nav.allProducts')}</a>
			</div>
		</div>
		<!-- Each photo opens the outfit it shows. -->
		<div class="mosaic">
			{#each HERO as photo, i (photo.src)}
				<a href={photo.href} class="tile" class:big={i === 0}>
					<img
						src={photo.src}
						srcset={photoSrcset(photo.src, 1254)}
						sizes={i === 0 ? '(min-width: 900px) 420px, 66vw' : '(min-width: 900px) 210px, 33vw'}
						alt={photo.alt}
						width="1254"
						height="1254"
						fetchpriority={i === 0 ? 'high' : undefined}
					/>
				</a>
			{/each}
		</div>
	</section>
</div>

<Collection
	eyebrow="The shop"
	title="Dressed for the holidays."
	lead="Choose the outfit, then the colour and size on its page."
	level="h2"
	products={data.products}
	empty="New products are on their way."
/>

<style>
	.hero-band {
		background: var(--brand-teal-band, #12858f);
	}
	.hero {
		max-width: 1176px;
		margin: 0 auto;
		padding: 20px 16px 28px;
		display: grid;
		gap: 20px;
		align-items: center;
		/* The section carries `.tree-theme` for its colours, not its page bg. */
		background: transparent;
	}
	/* One large photo and two small ones stacked beside it. Every tile is
	   square, like the photos: the small ones were 4:3, which cut the
	   reindeer hoodie's antlers and both dogs' paws off, where the tabby
	   kept its whole outfit and a margin round it. Square, each photo shows
	   whole, its pet centred with the same room as the cat. */
	.mosaic {
		order: -1;
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 10px;
	}
	.tile {
		position: relative;
		display: block;
		border-radius: 14px;
		overflow: hidden;
		background: var(--tree-tint);
	}
	.tile:not(.big) {
		aspect-ratio: 1;
	}
	/* Two small tiles and a gap tall, so a gap's width off square. */
	.tile.big {
		grid-row: 1 / 3;
	}
	.tile img {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.4s ease;
	}
	.tile:hover img {
		transform: scale(1.03);
	}
	.tile:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
	}
	.eyebrow {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 1.5px;
		text-transform: uppercase;
		/* A pale peach of the logo's orange: on the teal band, the orange
		   itself is too dark to read this small. */
		color: #ffd9c4;
	}
	.hero-text h1 {
		margin: 0;
		font-size: 30px;
		line-height: 1.15;
		font-weight: 700;
		letter-spacing: -0.3px;
		color: #fff;
	}
	.lead {
		margin: 10px 0 0;
		font-size: 15px;
		line-height: 1.6;
		color: #fff;
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
		/* The orange button needs no line of its own: its fill is the edge. */
		border: 1px solid transparent;
	}
	/* The logo's orange with navy lettering: white on this orange is too
	   faint to read. */
	.primary {
		background: var(--brand-orange, #ff6b2c);
		border-color: var(--brand-orange, #ff6b2c);
		color: var(--brand-navy, #0b3c49);
	}
	.primary:hover {
		background: #ff8550;
		border-color: #ff8550;
	}
	/* A fine white line, half the old one: an inset shadow rather than the
	   border, because Chrome rounds a border under 1px up to a whole one,
	   and a shadow's half pixel it draws as it is, like Safari. */
	.actions .secondary {
		color: #fff;
		box-shadow: inset 0 0 0 0.5px #fff;
	}
	.secondary:hover {
		background: rgb(255 255 255 / 0.12);
	}
	.actions a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 3px;
	}
	@media (min-width: 900px) {
		.hero {
			grid-template-columns: 5fr 7fr;
			gap: 56px;
			padding-top: 48px;
			padding-bottom: 28px;
		}
		.mosaic {
			order: 0;
			gap: 14px;
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
