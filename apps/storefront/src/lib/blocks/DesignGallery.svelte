<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * The hero photo, following the design picked beside it.
	 *
	 * Reads the choice from funnel state rather than a prop: the picker writes
	 * `design`, this reads it, and neither block knows the other exists. A design
	 * with no photo gets a box that SAYS it is a placeholder. A stand-in photo
	 * of another design would show a customer something they are not buying.
	 *
	 * `extras` are photos of the product as a whole (a flat-lay, the back, a
	 * detail), shown after the designs' own photos. Arrows and a swipe walk the
	 * thumbnails in order. Landing on a design's photo chooses that design,
	 * exactly as tapping its thumbnail does, so the photo in the frame and the
	 * choice in the picker never disagree; an extra never changes the design.
	 *
	 * `hint` swaps the counter chip and arrows for one quiet line under the
	 * photo ("Swipe to explore … 2 / 5"), for a page styled that way.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Design = { code: string; label: string; image?: string; alt?: string };
	type Extra = { src: string; alt?: string };

	const p = $derived(
		(block.props ?? {}) as {
			designs?: Design[];
			extras?: Extra[];
			stateField?: string;
			title?: string;
			hint?: string;
			/**
			 * A page's own photo for a design, by code, in place of the
			 * catalogue's. Lets a page reshoot a colour without a catalogue
			 * migration; the design itself still comes from the catalogue.
			 */
			photos?: Record<string, { src: string; alt?: string }>;
		}
	);

	const designs = $derived(
		(p.designs ?? []).map((d) => {
			const own = p.photos?.[d.code];
			return own?.src ? { ...d, image: own.src, alt: own.alt ?? d.alt } : d;
		})
	);
	const extras = $derived((p.extras ?? []).filter((e) => e.src));
	const field = $derived(p.stateField ?? 'design');
	const current = $derived(
		designs.find((d) => d.code === ctx.state.get(field)) ?? designs[0] ?? null
	);

	/** Which extra is in the frame, or null for the chosen design's photo. */
	let extra = $state<number | null>(null);
	// Positions follow the thumbnails: the designs first, then the extras.
	const total = $derived(designs.length + extras.length);
	const position = $derived(
		extra === null ? Math.max(0, designs.findIndex((d) => d.code === current?.code)) : designs.length + extra
	);
	const shown = $derived(extra === null ? null : (extras[extra] ?? null));

	// A design chosen anywhere (the picker included) is what the buyer wants
	// to see next, so it takes the frame back from whatever extra was in it.
	let lastDesign = '';
	$effect(() => {
		const code = current?.code ?? '';
		if (code === lastDesign) return;
		lastDesign = code;
		extra = null;
	});

	function show(code: string) {
		extra = null;
		ctx.state.set(field, code);
		ctx.track('gallery_select', { design: code });
	}

	function view(i: number | null) {
		extra = i;
		ctx.track('gallery_view', { photo: i === null ? 0 : i + 1 });
	}

	function step(by: number) {
		const next = (position + by + total) % total;
		if (next < designs.length) show(designs[next].code);
		else view(next - designs.length);
	}

	// A horizontal swipe on the frame steps through the photos. Vertical
	// movement is left alone, so the page still scrolls over the photo.
	let touchX = 0;
	let touchY = 0;
	function touchStart(e: TouchEvent) {
		touchX = e.touches[0].clientX;
		touchY = e.touches[0].clientY;
	}
	function touchEnd(e: TouchEvent) {
		const dx = e.changedTouches[0].clientX - touchX;
		const dy = e.changedTouches[0].clientY - touchY;
		if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
	}
</script>

{#if current}
	<section class="gallery" class:plain={Boolean(p.hint)} aria-label={p.title ?? 'Product photos'}>
		<!-- Swipe is a touch shortcut only: the arrows and the thumbnails are
		     the keyboard and screen-reader way through the same photos. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="frame"
			ontouchstart={extras.length ? touchStart : undefined}
			ontouchend={extras.length ? touchEnd : undefined}
		>
			{#if shown}
				<img src={shown.src} alt={shown.alt ?? ''} width="1100" height="985" />
			{:else if current.image}
				<img
					src={current.image}
					alt={current.alt ?? current.label}
					width="1100"
					height="985"
					fetchpriority="high"
				/>
			{:else}
				<div class="placeholder" role="img" aria-label="Photo placeholder for {current.label}">
					<span class="tag">Placeholder</span>
					<span>Photo of {current.label} coming soon</span>
				</div>
			{/if}
			{#if !shown && !p.hint}<span class="ribbon" aria-hidden="true">{current.label}</span>{/if}
			{#if extras.length && !p.hint}
				<span class="count" aria-hidden="true">{position + 1} / {total}</span>
				<button type="button" class="arrow prev" aria-label="Previous photo" onclick={() => step(-1)}
					>‹</button
				>
				<button type="button" class="arrow next" aria-label="Next photo" onclick={() => step(1)}
					>›</button
				>
			{/if}
		</div>

		{#if p.hint && total > 1}
			<p class="hint">
				<span>{p.hint}</span>
				<span aria-live="polite">{position + 1} / {total}</span>
			</p>
		{/if}

		{#if designs.length > 1 || extras.length}
			<ul class="thumbs" class:scroll={extras.length > 0}>
				{#each designs as d (d.code)}
					<li>
						<button
							type="button"
							class:active={d.code === current.code && !shown}
							aria-current={d.code === current.code && !shown ? 'true' : undefined}
							aria-pressed={d.code === current.code}
							aria-label="Show {d.label}"
							onclick={() => show(d.code)}
						>
							{#if d.image}
								<img src={d.image} alt="" width="120" height="108" loading="lazy" />
							{:else}
								<span class="mini-placeholder">Placeholder</span>
							{/if}
						</button>
					</li>
				{/each}
				{#each extras as e, i (e.src)}
					<li>
						<button
							type="button"
							class:active={extra === i}
							aria-label="Show photo {designs.length + i + 1}{e.alt ? `: ${e.alt}` : ''}"
							onclick={() => view(i)}
						>
							<img src={e.src} alt="" width="120" height="108" loading="lazy" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.gallery {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.frame {
		position: relative;
		overflow: hidden;
		border-radius: 24px;
		background: var(--xmas-snow, #fffdf8);
		box-shadow: 0 0 0 4px var(--xmas-red, #b3202a), 0 0 0 8px var(--xmas-snow, #fffdf8),
			0 12px 32px rgb(11 60 73 / 0.18);
		margin: 8px;
	}
	.frame img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1100 / 985;
		object-fit: cover;
	}
	.ribbon {
		position: absolute;
		left: 12px;
		bottom: 12px;
		border-radius: 9999px;
		background: var(--xmas-snow, #fffdf8);
		color: var(--brand-navy, #0b3c49);
		padding: 4px 12px;
		font-size: 14px;
		font-weight: 600;
	}
	.placeholder {
		aspect-ratio: 1100 / 985;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: 3px dashed var(--brand-teal, #14a3b0);
		color: var(--brand-navy, #0b3c49);
		text-align: center;
		padding: 24px;
	}
	.tag {
		border-radius: 6px;
		background: var(--brand-orange, #ff6b2c);
		color: var(--brand-navy, #0b3c49);
		padding: 2px 8px;
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.thumbs {
		display: flex;
		gap: 10px;
		padding: 0 8px;
		list-style: none;
		margin: 0;
	}
	.thumbs button {
		display: block;
		width: 76px;
		border-radius: 14px;
		overflow: hidden;
		border: 3px solid transparent;
		background: var(--xmas-snow, #fffdf8);
		padding: 0;
		cursor: pointer;
	}
	/* Five or more thumbnails overrun a phone: they scroll rather than wrap. */
	.thumbs.scroll {
		overflow-x: auto;
		scrollbar-width: none;
		padding-bottom: 2px;
	}
	.thumbs.scroll li {
		flex: none;
	}
	/* The plain frame: square, softly rounded, no ring, small square thumbs
	   with a pine outline on the one in the frame. */
	.plain .frame {
		margin: 0;
		border-radius: 12px;
		box-shadow: none;
		background: #f4f0e7;
	}
	.plain .frame img {
		aspect-ratio: 1;
	}
	.plain .thumbs {
		padding: 0;
		gap: 10px;
	}
	.plain .thumbs button {
		width: 58px;
		border: 2px solid transparent;
		border-radius: 10px;
		background: transparent;
		padding: 2px;
	}
	.plain .thumbs button img {
		border-radius: 7px;
	}
	.plain .thumbs button.active {
		border-color: var(--tree-green, #285b43);
	}
	@media (min-width: 768px) {
		.plain .thumbs button {
			width: 70px;
		}
	}
	.hint {
		display: flex;
		justify-content: space-between;
		margin: -4px 8px 0;
		font-size: 11px;
		line-height: 17.6px;
		color: #637168;
	}
	.count {
		position: absolute;
		top: 12px;
		right: 12px;
		border-radius: 9999px;
		background: rgb(11 60 73 / 0.72);
		color: #fff;
		padding: 2px 10px;
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.arrow {
		position: absolute;
		top: 50%;
		translate: 0 -50%;
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 50%;
		background: rgb(255 253 248 / 0.92);
		color: var(--brand-navy, #0b3c49);
		font-size: 28px;
		line-height: 1;
		padding-bottom: 4px;
		box-shadow: 0 4px 12px rgb(11 60 73 / 0.18);
		cursor: pointer;
	}
	.arrow.prev {
		left: 10px;
	}
	.arrow.next {
		right: 10px;
	}
	.arrow:focus-visible {
		outline: 3px solid var(--brand-orange, #ff6b2c);
		outline-offset: 2px;
	}
	.thumbs button.active {
		border-color: var(--brand-teal, #14a3b0);
	}
	.thumbs button:focus-visible {
		outline: 3px solid var(--brand-orange, #ff6b2c);
		outline-offset: 2px;
	}
	.thumbs img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
	}
	.mini-placeholder {
		display: flex;
		aspect-ratio: 1;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		color: var(--brand-navy, #0b3c49);
	}
</style>
