<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';

	/**
	 * `accordion` — shipping, guarantee, what's included, FAQ.
	 *
	 * Built on native <details>/<summary> rather than buttons with aria-expanded:
	 * keyboard handling, screen-reader semantics and find-in-page all come free,
	 * and the rows open before any JS has run. `exclusive` uses the platform's own
	 * `name` grouping, so one-open-at-a-time needs no state either.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	type Row = {
		label?: string;
		body?: string;
		icon?: string;
		open?: boolean;
		/**
		 * An optional link under the answer — a shipping policy, a size chart.
		 *
		 * A separate field rather than markup inside `body`, because `body` is
		 * plain text on purpose: manifests are JSON that a model or a hand-edit can
		 * author, and allowing HTML there hands anyone who can publish one a script
		 * tag on the storefront. This gives the one thing the copy actually needs
		 * without opening that door.
		 */
		link?: { label?: string; href?: string };
	};

	const p = $derived(
		(block.props ?? {}) as {
			items?: Row[];
			/** Only one row open at a time. */
			exclusive?: boolean;
			/**
			 * Hairlines enclosing the list — above the first row, between, and below
			 * the last. Off by default; spacing usually reads cleaner on a short set.
			 */
			divided?: boolean;
			width?: 'shell' | 'page' | 'article' | 'full';
			/**
			 * Caps the ANSWER's line length independently of the row.
			 *
			 * On a full-width FAQ the rules and the question want the whole column,
			 * but a paragraph set to 1300px is unreadable — the eye loses the line on
			 * the return sweep. Only the body is constrained, so the rules still run
			 * edge to edge.
			 */
			bodyWidth?: 'measure' | 'article' | 'full';
		}
	);

	const items = $derived(p.items ?? []);
	const WIDTHS = { shell: 'max-w-shell', page: 'max-w-page', article: 'max-w-article', full: 'max-w-none' };
	const BODY = { measure: 'max-w-measure', article: 'max-w-article', full: 'max-w-none' };
	const widthClass = $derived(WIDTHS[p.width ?? 'page'] ?? WIDTHS.page);
	const bodyClass = $derived(BODY[p.bodyWidth ?? 'article'] ?? BODY.article);

	/**
	 * A small built-in set for the rows DR pages actually use. Anything else falls
	 * through as text, so an emoji works without the library shipping an icon
	 * pack — and a host with its own icons just passes them as `body` markup-free
	 * labels instead.
	 */
	const ICONS: Record<string, string> = {
		truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
		refund: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
		gift: 'M4 11h16v9H4zM2 7h20v4H2zM12 7v13M12 7S9.5 3 7.5 4.5 9 7 12 7zM12 7s2.5-4 4.5-2.5S15 7 12 7z',
		shield: 'M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z',
		clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
		question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.2-1.2.9-1.2 1.6M12 17h.01'
	};
</script>

{#if items.length}
	<section class="mx-auto w-full {widthClass} px-gutter">
		<ul class="flex flex-col {p.divided ? 'gap-0 border-t border-[#e2e0dc]' : 'gap-4'}">
			{#each items as row, n (n)}
				<li class={p.divided ? 'border-b border-[#e2e0dc]' : ''}>
					<details
						name={p.exclusive ? `acc-${block.id}` : undefined}
						open={row.open}
						ontoggle={(e) => {
							if ((e.currentTarget as HTMLDetailsElement).open)
								ctx.track('accordion_open', { index: n, label: row.label });
						}}
					>
						<summary
							class="text-17 flex cursor-pointer list-none items-center gap-3 py-4 font-semibold select-none"
						>
							{#if row.icon}
								{#if ICONS[row.icon]}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="1.75"
										stroke-linecap="round"
										stroke-linejoin="round"
										class="size-6 shrink-0"
										aria-hidden="true"
									>
										<path d={ICONS[row.icon]} />
									</svg>
								{:else}
									<span class="shrink-0" aria-hidden="true">{row.icon}</span>
								{/if}
							{/if}

							<span class="min-w-0 flex-1">{row.label}</span>

							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="chev size-4 shrink-0 transition-transform"
								aria-hidden="true"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</summary>

						{#if row.body || row.link?.href}
							<!-- whitespace-pre-line so a blank line in the answer renders as a
							     paragraph break. Real FAQ answers are rarely one paragraph, and
							     without this they collapse into a wall. -->
							<div class="text-15 text-fx-sub {bodyClass} flex flex-col items-start gap-2 pb-4">
								{#if row.body}<span class="whitespace-pre-line">{row.body}</span>{/if}
								{#if row.link?.href}
									<a
										href={row.link.href}
										class="text-fx-ink underline underline-offset-4 hover:opacity-80"
										onclick={() => ctx.track('accordion_link', { label: row.link?.label })}
									>
										{row.link.label ?? 'Read more'}
									</a>
								{/if}
							</div>
						{/if}
					</details>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	/* Safari still paints its own triangle without this. */
	summary::-webkit-details-marker {
		display: none;
	}
	details[open] .chev {
		transform: rotate(180deg);
	}
	@media (prefers-reduced-motion: reduce) {
		.chev {
			transition: none;
		}
	}
</style>
