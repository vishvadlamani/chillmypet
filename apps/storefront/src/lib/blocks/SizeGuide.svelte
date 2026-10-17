<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { emphasize } from '@funnel/blocks-dr/tokens';

	/**
	 * How to choose the WEARER'S size.
	 *
	 * `rows` come from the product's `specs.size_chart` metafield and are the
	 * supplier's measurements or nothing. Until they exist the table is replaced
	 * by a note that says so plainly: invented numbers on a size chart become
	 * returns.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Row = { size: string; cells: string[] };

	const p = $derived(
		(block.props ?? {}) as {
			title?: string;
			tips?: string[];
			/** Column headings after "Size". From the loader, so they match the rows. */
			columns?: string[];
			rows?: Row[];
			pending?: string;
			contact?: string;
			eyebrow?: string;
			/** A sentence under the title. */
			lead?: string;
			/** `band`: the tree storefront's sage band, text beside the table on wide screens. */
			look?: 'plain' | 'band';
		}
	);
	const rows = $derived(p.rows ?? []);
	const columns = $derived(p.columns ?? []);
</script>

<section class="guide" class:band={p.look === 'band'} id="size-guide" aria-labelledby="size-guide-title">
	<div class="intro">
	{#if p.eyebrow}<p class="eyebrow">{p.eyebrow}</p>{/if}
	<h2 id="size-guide-title">{p.title ?? 'Size guide'}</h2>
	{#if p.lead}<p class="lead">{p.lead}</p>{/if}

	{#if p.tips?.length}
		<ul class="tips">
			{#each p.tips as tip, i (i)}
				<li>
					{#each emphasize(tip) as span, j (j)}
						{#if span.strong}<strong>{span.text}</strong>{:else}{span.text}{/if}
					{/each}
				</li>
			{/each}
		</ul>
	{/if}
	{#if p.look === 'band' && p.contact}<p class="contact">{p.contact}</p>{/if}
	</div>

	{#if rows.length}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th scope="col">Size</th>
						{#each columns as column (column)}<th scope="col">{column}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.size)}
						<tr>
							<th scope="row">{row.size}</th>
							{#each row.cells as cell, i (i)}<td>{cell}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if p.pending}
		<p class="pending">{p.pending}</p>
	{/if}

	{#if p.contact && p.look !== 'band'}<p class="contact">{p.contact}</p>{/if}
</section>

<style>
	.guide {
		width: 100%;
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 var(--spacing-gutter, 1.5rem);
		color: var(--brand-navy, #0b3c49);
	}
	h2 {
		font-size: 28px;
		line-height: 1.2;
		font-weight: 700;
		margin: 0 0 12px;
	}
	.tips {
		display: grid;
		gap: 8px;
		padding: 0;
		margin: 0 0 16px;
		list-style: none;
		font-size: 17px;
		line-height: 1.45;
	}
	.tips li {
		padding-left: 28px;
		position: relative;
	}
	.tips li::before {
		content: '❄';
		position: absolute;
		left: 0;
		color: var(--brand-teal, #14a3b0);
	}
	.pending,
	.contact {
		font-size: 15px;
		line-height: 1.5;
		margin: 0 0 8px;
	}
	.pending {
		border-left: 4px solid var(--brand-teal, #14a3b0);
		background: #fff;
		border-radius: 0 12px 12px 0;
		padding: 12px 16px;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		min-width: 320px;
		width: 100%;
		max-width: 560px;
		font-size: 15px;
		background: #fff;
	}
	th,
	td {
		padding: 8px 12px;
		border-bottom: 1px solid #d6dfe2;
		text-align: left;
	}

	/* ---- look: 'band' ------------------------------------------------- */
	.band {
		max-width: none;
		width: 100vw;
		margin-left: calc(50% - 50vw);
		padding: 28px 18px;
		background: var(--tree-sage, #eeeede);
		color: var(--tree-ink, #243b31);
		display: grid;
		gap: 24px;
	}
	@media (min-width: 768px) {
		.band {
			width: auto;
			max-width: 1176px;
			margin: 0 auto;
			border-radius: 12px;
			padding: 48px 72px;
			grid-template-columns: 1fr 1fr;
			gap: 56px;
			align-items: start;
		}
	}
	.band .eyebrow {
		margin: 0 0 14px;
		font-size: 11px;
		line-height: 17.6px;
		font-weight: 700;
		letter-spacing: 1.8px;
		text-transform: uppercase;
	}
	.band h2 {
		margin: 0 0 14px;
		font-size: 27px;
		line-height: 33.75px;
		letter-spacing: -0.5px;
		color: var(--tree-green, #285b43);
	}
	@media (min-width: 768px) {
		.band h2 {
			font-size: 36px;
			line-height: 45px;
		}
	}
	.band .lead {
		margin: 0 0 14px;
		font-size: 15px;
		line-height: 24px;
	}
	.band .tips {
		gap: 6px;
		font-size: 11px;
		line-height: 16.5px;
		color: var(--tree-muted, #637168);
	}
	.band .tips li {
		padding-left: 0;
	}
	.band .tips li::before {
		content: none;
	}
	.band .contact {
		font-size: 11px;
		line-height: 16.5px;
		color: var(--tree-muted, #637168);
	}
	.band table {
		max-width: none;
		background: transparent;
		font-size: 12px;
		line-height: 19.2px;
	}
	.band th,
	.band td {
		padding: 15px 8px;
		border: 1px solid var(--tree-line, #c7cec2);
		border-width: 1px 0;
	}
	.band thead th {
		font-weight: 700;
	}
</style>
