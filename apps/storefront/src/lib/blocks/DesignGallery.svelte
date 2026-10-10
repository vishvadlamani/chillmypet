<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * The hero photo, following the design picked beside it.
	 *
	 * Reads the choice from funnel state rather than a prop: the picker writes
	 * `design`, this reads it, and neither block knows the other exists. A design
	 * with no photo gets a box that SAYS it is a placeholder. A stand-in photo
	 * of another design would show a customer something they are not buying.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Design = { code: string; label: string; image?: string; alt?: string };

	const p = $derived(
		(block.props ?? {}) as { designs?: Design[]; stateField?: string; title?: string }
	);

	const designs = $derived(p.designs ?? []);
	const field = $derived(p.stateField ?? 'design');
	const current = $derived(
		designs.find((d) => d.code === ctx.state.get(field)) ?? designs[0] ?? null
	);

	function show(code: string) {
		ctx.state.set(field, code);
		ctx.track('gallery_select', { design: code });
	}
</script>

{#if current}
	<section class="gallery" aria-label={p.title ?? 'Product photos'}>
		<div class="frame">
			{#if current.image}
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
			<span class="ribbon" aria-hidden="true">{current.label}</span>
		</div>

		{#if designs.length > 1}
			<ul class="thumbs">
				{#each designs as d (d.code)}
					<li>
						<button
							type="button"
							class:active={d.code === current.code}
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
