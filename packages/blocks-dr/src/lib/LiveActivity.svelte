<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `live_activity` — recent-purchase / recent-signup activity.
	 *
	 * Two shapes of the same thing: `line` rotates one entry at a time, `feed`
	 * scrolls a continuous column. Both take their entries from `items`.
	 *
	 * The block does NOT generate entries. The component this was lifted from
	 * carried arrays of names, cities and niches and assembled lines at random —
	 * fine as one app's choice, wrong for a shared library, where a block that
	 * invents its own social proof would do it silently in every project that
	 * installed it. `items` is `$ref`-able, so it reads real orders when there are
	 * some and renders nothing when there aren't.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Entry = {
		/** Who. `{city}` in any field is replaced with the visitor's own city. */
		name?: string;
		place?: string;
		action?: string;
		time?: string;
	};

	const p = $derived(
		(block.props ?? {}) as {
			items?: Entry[];
			variant?: 'line' | 'feed';
			/** line: ms between entries. */
			rotateMs?: number;
			/** feed: how many rows are visible, and how long one full loop takes. */
			visibleLines?: number;
			loopSeconds?: number;
			accent?: string;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	const items = $derived(p.items ?? []);
	const variant = $derived(p.variant ?? 'line');
	const accent = $derived(p.accent ?? '#1fa85c');
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);

	/** `{city}` lets one entry read as local without the host duplicating copy. */
	const city = $derived(ctx.state.city());
	const sub = (v?: string) => (v ?? '').replace('{city}', city);

	// Rotation is index-based, not random: the same visitor sees a stable order,
	// and it's reproducible when something looks wrong.
	let i = $state(0);
	$effect(() => {
		if (variant !== 'line' || items.length < 2) return;
		const id = setInterval(() => (i = (i + 1) % items.length), p.rotateMs ?? 20000);
		return () => clearInterval(id);
	});

	const current = $derived(items[i % Math.max(1, items.length)]);

	// Joined in script, not in markup. Interpolations separated only by template
	// whitespace across an {#if} boundary lose the space — it rendered
	// "Jennain Toronto". Explicit joins can't do that.
	const who = $derived([sub(current?.name), sub(current?.place)].filter(Boolean).join(' '));
	const said = $derived(sub(current?.action));
	const when = $derived(sub(current?.time));

	const LINE_H = 24;
	const visible = $derived(p.visibleLines ?? 2);
	// Rendered twice so the upward scroll wraps with no visible seam.
	const loop = $derived([...items, ...items]);
</script>

{#if items.length}
	<section class="mx-auto w-full {widthClass} px-gutter">
		{#if variant === 'feed'}
			<div
				class="overflow-hidden"
				style:height="{visible * LINE_H}px"
				aria-label="Recent activity"
			>
				<ul
					class="ticker text-12 text-fx-muted font-mono"
					style:--line-height="{LINE_H}px"
					style:--distance="{items.length * LINE_H}px"
					style:--loop="{p.loopSeconds ?? 20}s"
				>
					{#each loop as it, n (n)}
						<!-- The row box is 24px because the scroll distance is a multiple of
						     it; the text keeps its own 16px paired leading and centres inside.
						     Setting line-height to 24 instead would put 12px type on a
						     line-height the scale doesn't pair it with. -->
						<li
							class="flex items-center gap-1 whitespace-nowrap"
							style:height="{LINE_H}px"
						>
							{#if it.name}<span class="text-fx-sub">{sub(it.name)}</span>{/if}
							{#if it.place}<span>{sub(it.place)}</span>{/if}
							{#if it.action}<span style:color={accent}>{sub(it.action)}</span>{/if}
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="h-5 w-full overflow-hidden">
				{#key i}
					<div
						in:fly={{ y: 10, duration: 260 }}
						class="text-13 text-fx-muted flex items-center justify-center gap-2"
					>
						<svg
							class="size-4 shrink-0"
							style:color={accent}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M20 6 9 17l-5-5" />
						</svg>
						<span class="min-w-0 truncate">
							<span class="text-fx-sub font-medium">{who}</span>
							<span>{said}</span>
							{#if when}<span class="text-fx-sub font-medium">· {when}</span>{/if}
						</span>
					</div>
				{/key}
			</div>
		{/if}
	</section>
{/if}

<style>
	.ticker {
		animation: scroll-up var(--loop) linear infinite;
		will-change: transform;
	}
	@keyframes scroll-up {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(calc(-1 * var(--distance)));
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ticker {
			animation: none;
		}
	}
</style>
