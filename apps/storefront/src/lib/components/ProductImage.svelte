<script lang="ts">
	// Real photography when the colour has one, otherwise a tinted placeholder so
	// a store without images still renders a coherent gallery.
	let {
		src = null,
		hex,
		label,
		class: className = '',
		loading = 'lazy'
	}: {
		src?: string | null;
		hex: string;
		label: string;
		class?: string;
		loading?: 'eager' | 'lazy';
	} = $props();

	const id = $props.id();
</script>

{#if src}
	<img
		{src}
		{loading}
		alt={label}
		class="{className} bg-tide-50 object-cover"
		decoding="async"
	/>
{:else}
	<svg
		viewBox="0 0 400 400"
		class={className}
		role="img"
		aria-label={label}
		preserveAspectRatio="xMidYMid slice"
	>
		<defs>
			<linearGradient id="bg-{id}" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#f2f8fb" />
				<stop offset="100%" stop-color="#dcecf4" />
			</linearGradient>
			<linearGradient id="jacket-{id}" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color={hex} stop-opacity="1" />
				<stop offset="100%" stop-color={hex} stop-opacity="0.78" />
			</linearGradient>
		</defs>

		<rect width="400" height="400" fill="url(#bg-{id})" />

		<g opacity="0.5" fill="none" stroke="#8fc4dc" stroke-width="3" stroke-linecap="round">
			<path d="M-10 306 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0" />
			<path d="M-10 330 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity="0.7" />
			<path d="M-10 354 q30 -14 60 0 t60 0 t60 0 t60 0 t60 0 t60 0" opacity="0.45" />
		</g>

		<g transform="translate(200 196)">
			<rect x="-96" y="-74" width="192" height="148" rx="34" fill="url(#jacket-{id})" />
			<rect
				x="-96"
				y="-74"
				width="192"
				height="148"
				rx="34"
				fill="none"
				stroke="#0f2b36"
				stroke-opacity="0.16"
				stroke-width="3"
			/>
			<path
				d="M-34 -74 q34 -46 68 0"
				fill="none"
				stroke="#0f2b36"
				stroke-opacity="0.5"
				stroke-width="11"
				stroke-linecap="round"
			/>
			<g stroke="#0f2b36" stroke-opacity="0.22" stroke-width="9" stroke-linecap="round">
				<path d="M-42 -74 v148" />
				<path d="M42 -74 v148" />
			</g>
			<g stroke="#ffffff" stroke-opacity="0.72" stroke-width="6" stroke-linecap="round">
				<path d="M-70 -30 h140" />
				<path d="M-70 34 h140" />
			</g>
		</g>
	</svg>
{/if}
