<script lang="ts">
	import { photoSrcset } from '$lib/resized';
	import type { ProductCard } from '$lib/store/collection';

	/**
	 * A collection's cards, each linking to its product page. Wear it inside
	 * `.tree-theme`: the colours are the tree storefront's. On a phone each
	 * card is a row, photo beside the words, so the first screen shows more
	 * than one product and every one with its price.
	 */
	let { products, eager = 2 }: { products: ProductCard[]; eager?: number } = $props();
</script>

<ul class="grid">
	{#each products as product, i (product.slug)}
		<li>
			<a class="card" href="/products/{product.slug}">
				<figure class:contain={product.fit === 'contain'}>
					{#if product.image}
						<img
							src={product.image}
							srcset={photoSrcset(product.image, 1200)}
							sizes="(min-width: 640px) 420px, 100vw"
							alt={product.alt}
							width="800"
							height="800"
							loading={i < eager ? 'eager' : 'lazy'}
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
								<span class="swatch" style:background={colour.hex ?? '#ccc'} title={colour.label}
								></span>
							{/each}
							<span class="sr-only">
								{product.colours.map((c) => c.label).join(', ')}
							</span>
						</span>
						{#if product.sizes}<span>Sizes {product.sizes}</span>{/if}
					</p>
					<span class="cta">{!product.inStock ? 'Sold out' : product.pickSize ? 'Choose a size' : 'Shop now'}</span>
				</div>
			</a>
		</li>
	{/each}
</ul>

<style>
	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 16px;
	}
	@media (min-width: 640px) {
		.grid {
			/* Columns of a card's width, centred: two products sit side by side
			   in the middle rather than stretching to half the page each. */
			grid-template-columns: repeat(auto-fit, minmax(280px, 340px));
			justify-content: center;
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
	/* A whole studio shot, never cropped. The frame takes the photo's own
	   warm backdrop (top to bottom), so the bars either side are invisible. */
	figure.contain {
		background: linear-gradient(#f8f1e7, #eee4d6);
	}
	figure.contain img {
		object-fit: contain;
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 14px 16px 16px;
		flex: 1;
	}
	/* `.card` too: tree-theme.css styles headings inside `.tree-theme`. */
	.card h2 {
		margin: 0;
		font-size: 18px;
		line-height: 1.3;
		font-weight: 600;
	}
	.sub {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
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
		.card h2 {
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
</style>
