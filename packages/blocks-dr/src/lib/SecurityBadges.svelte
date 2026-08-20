<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `security_badges` — the reassurance seals that sit beside a buy button.
	 *
	 * Deliberately separate from `payment_badges`: those say *which* methods you
	 * take, these say the transaction is safe. They're usually placed apart (logos
	 * under the button, seals near the form) and one is often shown without the
	 * other.
	 *
	 * Marks are inline SVG, not images — a broken seal at checkout costs more than
	 * the bytes saved.
	 */
	let { block }: { block: Block; ctx: FlowContext } = $props();

	type Seal = { icon?: string; label?: string; sub?: string };

	const p = $derived(
		(block.props ?? {}) as {
			items?: Seal[];
			layout?: 'row' | 'grid';
			color?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const items = $derived(
		p.items?.length
			? p.items
			: [
					{ icon: 'lock', label: 'Secure SSL', sub: 'Encryption' },
					{ icon: 'shield', label: 'Guaranteed', sub: 'Safe Checkout' }
				]
	);

	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const color = $derived(p.color ?? '#5b6470');

	/** Same convention as `accordion`: known key → line icon, anything else → text. */
	const ICONS: Record<string, string> = {
		lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
		shield: 'M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6zM9 12l2 2 4-4',
		refund: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
		truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
		clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
		card: 'M2 6h20v12H2zM2 10h20'
	};
</script>

<section class="mx-auto w-full {widthClass} px-gutter">
	<ul
		class="flex flex-wrap items-center justify-center {p.layout === 'grid'
			? 'gap-x-8 gap-y-4'
			: 'gap-x-8 gap-y-4 sm:gap-x-12'}"
	>
		{#each items as s, n (n)}
			<li class="flex items-center gap-2" style:color>
				{#if s.icon}
					{#if ICONS[s.icon]}
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="size-8 shrink-0"
							aria-hidden="true"
						>
							<path d={ICONS[s.icon]} />
						</svg>
					{:else}
						<span class="text-21 shrink-0" aria-hidden="true">{s.icon}</span>
					{/if}
				{/if}
				<span class="text-13 tracking-snug font-bold uppercase">
					{s.label}{#if s.sub}<br />{s.sub}{/if}
				</span>
			</li>
		{/each}
	</ul>
</section>
