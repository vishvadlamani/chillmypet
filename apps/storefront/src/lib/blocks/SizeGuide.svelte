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

	type Row = { size: string; chest: string; length: string };

	const p = $derived(
		(block.props ?? {}) as {
			title?: string;
			tips?: string[];
			rows?: Row[];
			pending?: string;
			contact?: string;
		}
	);
	const rows = $derived(p.rows ?? []);
</script>

<section class="guide" id="size-guide" aria-labelledby="size-guide-title">
	<h2 id="size-guide-title">{p.title ?? 'Size guide'}</h2>

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

	{#if rows.length}
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Length</th></tr>
				</thead>
				<tbody>
					{#each rows as row (row.size)}
						<tr><th scope="row">{row.size}</th><td>{row.chest}</td><td>{row.length}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if p.pending}
		<p class="pending">{p.pending}</p>
	{/if}

	{#if p.contact}<p class="contact">{p.contact}</p>{/if}
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
</style>
