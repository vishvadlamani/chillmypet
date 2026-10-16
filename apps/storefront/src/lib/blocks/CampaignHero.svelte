<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from '@funnel/blocks-dr/tokens';

	/**
	 * `campaign_hero` — the opening screen of a campaign page.
	 *
	 * A product page opens on a product frame; a campaign page opens on a
	 * feeling. This is the full-bleed band above the buy box: one line that
	 * says what the product does for the person, the product itself, large,
	 * and one button that drops them at the picker. It carries no price and no
	 * urgency of its own — the picker quotes the price and the delivery strip
	 * carries the one real date — so it can never contradict either.
	 *
	 * `ctaHref` is an in-page anchor, not a route: where a visitor goes next is
	 * still the host's call, and the hero only scrolls them down the same page.
	 *
	 * `level: 2` makes it the closing band instead: the same pitch at the foot
	 * of a page that opens on the product, under an h2 so the page keeps one h1,
	 * with its photo loaded lazily because nobody starts there.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			eyebrow?: string;
			/** `**bold**` is honoured. */
			headline?: string;
			sub?: string;
			cta?: string;
			ctaHref?: string;
			/** The product, ideally a cut-out on a transparent background. */
			image?: { src?: string; alt?: string };
			/** Short reassurances under the button — "Free US shipping · 30-day returns". */
			notes?: string[];
			/** A small sticker on the image — "Red or green". */
			sticker?: string;
			/** 1 opens the page (the default); 2 closes it. */
			level?: 1 | 2;
		}
	);
	const opening = $derived(p.level !== 2);

	const headline = $derived(emphasize(p.headline ?? ''));

	function tapped() {
		ctx.track('hero_cta_click', { href: p.ctaHref });
	}
</script>

{#if p.headline}
	<section class="hero" aria-labelledby="{block.id}-title">
		<div class="inner">
			<div class="copy">
				{#if p.eyebrow}<p class="eyebrow">{p.eyebrow}</p>{/if}
				{#snippet title()}
					{#each headline as span, i (i)}
						{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
					{/each}
				{/snippet}
				{#if opening}
					<h1 id="{block.id}-title">{@render title()}</h1>
				{:else}
					<h2 id="{block.id}-title">{@render title()}</h2>
				{/if}
				{#if p.sub}<p class="sub">{p.sub}</p>{/if}
				{#if p.cta && p.ctaHref}
					<a class="cta" href={p.ctaHref} onclick={tapped}>{p.cta}</a>
				{/if}
				{#if p.notes?.length}
					<ul class="notes" aria-label="Good to know">
						{#each p.notes as note (note)}<li>{note}</li>{/each}
					</ul>
				{/if}
			</div>

			{#if p.image?.src}
				<div class="art">
					<div class="glow" aria-hidden="true"></div>
					<img
						src={p.image.src}
						alt={p.image.alt ?? ''}
						width="900"
						height="900"
						fetchpriority={opening ? 'high' : 'auto'}
						loading={opening ? 'eager' : 'lazy'}
					/>
					{#if p.sticker}<span class="sticker">{p.sticker}</span>{/if}
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	/* Full-bleed: the row is shell-wide, the band is window-wide. */
	.hero {
		position: relative;
		width: 100vw;
		margin-left: calc(50% - 50vw);
		color: var(--xmas-snow, #fffdf8);
		background:
			radial-gradient(circle at 78% 30%, rgb(255 107 44 / 0.22), transparent 38%),
			radial-gradient(circle at 15% 90%, rgb(179 32 42 / 0.35), transparent 45%),
			linear-gradient(160deg, #123f2b 0%, var(--xmas-pine, #1f5f3f) 55%, #0e3324 100%);
		overflow: hidden;
	}
	/* Snow, as a repeating dot field so it costs no image. */
	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle, rgb(255 255 255 / 0.55) 1.2px, transparent 2px),
			radial-gradient(circle, rgb(255 255 255 / 0.35) 1px, transparent 1.8px);
		background-size:
			140px 160px,
			90px 120px;
		background-position:
			20px 10px,
			60px 70px;
		opacity: 0.6;
		pointer-events: none;
	}
	.inner {
		position: relative;
		max-width: 1300px;
		margin: 0 auto;
		padding: 36px var(--spacing-gutter, 1.5rem) 28px;
		display: grid;
		gap: 24px;
		align-items: center;
	}
	@media (min-width: 768px) {
		.inner {
			grid-template-columns: 1.1fr 0.9fr;
			padding-top: 56px;
			padding-bottom: 56px;
			gap: 40px;
		}
	}
	.eyebrow {
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #f5c518;
	}
	.hero :is(h1, h2) {
		margin: 0;
		font-size: clamp(38px, 7.5vw, 64px);
		line-height: 1.02;
		font-weight: 700;
		letter-spacing: -0.01em;
		color: var(--xmas-snow, #fffdf8);
	}
	.hero :is(h1, h2) strong {
		color: #f5c518;
		font-weight: 700;
	}
	.sub {
		margin: 16px 0 0;
		font-size: 18px;
		line-height: 1.45;
		max-width: 34ch;
		color: rgb(255 253 248 / 0.9);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-top: 22px;
		padding: 16px 28px;
		border-radius: 9999px;
		background: var(--brand-orange, #ff6b2c);
		color: var(--brand-navy, #0b3c49);
		font-size: 18px;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 0 10px 28px rgb(0 0 0 / 0.25);
		transition: transform 120ms ease;
	}
	.cta:hover {
		transform: translateY(-1px);
	}
	@media (max-width: 767px) {
		.cta {
			width: 100%;
		}
	}
	.notes {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		margin: 16px 0 0;
		padding: 0;
		list-style: none;
		font-size: 14px;
		color: rgb(255 253 248 / 0.85);
	}
	.notes li::before {
		content: '✓ ';
		color: #f5c518;
	}
	.art {
		position: relative;
		justify-self: center;
		width: min(64vw, 340px);
		aspect-ratio: 1;
	}
	@media (min-width: 768px) {
		.art {
			width: min(100%, 520px);
		}
	}
	.glow {
		position: absolute;
		inset: 6%;
		border-radius: 50%;
		background: radial-gradient(circle, rgb(255 253 248 / 0.95) 0%, rgb(255 236 214 / 0.7) 45%, transparent 72%);
		filter: blur(2px);
	}
	.art img {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		filter: drop-shadow(0 18px 30px rgb(0 0 0 / 0.35));
	}
	.sticker {
		position: absolute;
		left: -2%;
		top: 10%;
		transform: rotate(-7deg);
		padding: 8px 14px;
		border-radius: 9999px;
		background: var(--xmas-red, #b3202a);
		color: #fff;
		font-size: 14px;
		font-weight: 700;
		box-shadow: 0 6px 16px rgb(0 0 0 / 0.25);
	}
	/* Phones open on the picture: it is the thing the ad showed them. */
	@media (max-width: 767px) {
		.art {
			order: -1;
		}
	}
</style>
