<script lang="ts">
	let { items }: { items: { q: string; a: string }[] } = $props();
</script>

<div class="divide-y divide-ink-200 border-y border-ink-200">
	{#each items as item (item.q)}
		<details class="group">
			<summary
				class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium marker:content-none"
			>
				<span>{item.q}</span>
				<svg
					class="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-45"
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="M10 4v12M4 10h12" />
				</svg>
			</summary>
			<p class="pb-5 text-ink-600">{item.a}</p>
		</details>
	{/each}
</div>
