<script lang="ts">
	import type { Block, FlowContext } from '@funnel/core';
	import { fill, monthName } from './tokens';

	/**
	 * `announcement_bar` — the offer strip that runs above everything.
	 *
	 * This is a billboard, not chrome. DR announcement bars are the loudest
	 * element on the page: display-scale type, deep vertical padding, full-bleed
	 * campaign colour. Sized as a notification strip it just reads as a cookie
	 * banner and gets ignored.
	 *
	 * Colour is per-campaign data, not a palette decision — `bg`/`fg` take raw
	 * values so an offer can change colour by republishing a manifest. `tone`
	 * covers the common cases without thinking about it.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** The offer. Emoji inline is expected — "50% OFF + 🚚 FREE Shipping".
			    `{month}` is substituted. */
			message?: string;
			/** Language for `{month}`. Fixed default so SSR and the client agree. */
			locale?: string;
			/**
			 * Values for any other `{token}` in `message`. Keeps campaign copy
			 * authored while the numbers inside it stay live:
			 *   message: 'Today only: {discount}% off'
			 *   vars: { discount: { $ref: 'offer.discountPct' } }
			 */
			vars?: Record<string, string | number>;
			cta?: string;
			href?: string;
			tone?: 'dark' | 'green' | 'red' | 'light';
			/** Raw overrides for campaign colour. Beat `tone`. */
			bg?: string;
			fg?: string;
			size?: 'sm' | 'md' | 'lg';
			weight?: 'light' | 'regular' | 'medium' | 'semibold' | 'bold';
			/** Constrained to the three families the host's theme defines. */
			font?: 'sans' | 'serif' | 'mono';
			uppercase?: boolean;
			/** Wide tracking is what makes short uppercase copy read as a label. */
			tracking?: 'tight' | 'normal' | 'wide' | 'wider';
			dismissible?: boolean;
			sticky?: boolean;
			width?: 'shell' | 'page' | 'article' | 'full';
		}
	);

	let dismissed = $state(false);

	// Written out in full — Tailwind only generates classes it can see literally.
	const TONES = {
		dark: 'bg-[#2b2b2b] text-white',
		green: 'bg-[#22301a] text-white',
		red: 'bg-[#3a1414] text-white',
		light: 'bg-fx-surface text-fx-ink'
	};
	const SIZES = {
		sm: 'text-13',
		md: 'text-17',
		lg: 'text-21'
	};
	// Light is the default on purpose: thin strokes at display scale is what
	// separates a premium offer bar from a shouty one. Bold is available when the
	// campaign wants to shout.
	const WEIGHTS = {
		light: 'font-light',
		regular: 'font-normal',
		medium: 'font-medium',
		semibold: 'font-semibold',
		bold: 'font-bold'
	};
	const WIDTHS = { shell: 'max-w-shell',
		page: 'max-w-page',
		article: 'max-w-article',
		full: 'max-w-none'
	};
	const FONTS = { sans: 'font-sans', serif: 'font-serif', mono: 'font-mono' };
	const TRACKING = {
		tight: 'tracking-headline',
		normal: 'tracking-normal',
		wide: 'tracking-label',
		wider: 'tracking-eyebrow'
	};

	const toneClass = $derived(p.bg ? '' : (TONES[p.tone ?? 'dark'] ?? TONES.dark));
	const sizeClass = $derived(SIZES[p.size ?? 'md'] ?? SIZES.md);
	const weightClass = $derived(WEIGHTS[p.weight ?? 'light'] ?? WEIGHTS.light);
	const widthClass = $derived(WIDTHS[p.width ?? 'full'] ?? WIDTHS.full);
	const fontClass = $derived(FONTS[p.font ?? 'sans'] ?? FONTS.sans);
	// Uppercase defaults to the wide tracking it needs; caps at normal tracking
	// read as a solid block rather than as words.
	const trackClass = $derived(
		TRACKING[p.tracking ?? (p.uppercase ? 'wide' : 'tight')] ?? TRACKING.tight
	);
	const message = $derived(
		p.message
			? fill(p.message, {
					month: monthName(p.locale),
					...Object.fromEntries(Object.entries(p.vars ?? {}).map(([k, v]) => [k, String(v)]))
				})
			: ''
	);
</script>

{#if p.message && !dismissed}
	<aside
		aria-label="Announcement"
		class="w-full {p.sticky ? 'sticky top-0 z-30' : ''} {toneClass} {fontClass}"
		style:background={p.bg}
		style:color={p.fg}
	>
		<!-- py-2 + a 24px line box = a 40px strip, which is what a phone
		     announcement bar actually is. pr when dismissible so copy clears the ✕. -->
		<div
			class="mx-auto flex {widthClass} flex-wrap items-center justify-center gap-x-3 gap-y-1 px-gutter py-2 text-center {p.dismissible
				? 'relative pr-10'
				: ''}"
		>
			<p class="{sizeClass} {weightClass} {trackClass} text-balance {p.uppercase ? 'uppercase' : ''}">
				{message}
			</p>

			{#if p.cta && p.href}
				<a
					href={p.href}
					onclick={() => ctx.track('announcement_click', { href: p.href })}
					class="{sizeClass} font-semibold underline underline-offset-4 transition-opacity hover:opacity-80"
				>
					{p.cta}
				</a>
			{/if}

			{#if p.dismissible}
				<button
					type="button"
					aria-label="Dismiss announcement"
					onclick={() => {
						dismissed = true;
						ctx.track('announcement_dismiss');
					}}
					class="absolute top-1/2 right-4 -translate-y-1/2 p-2 text-[20px] leading-none opacity-50 transition-opacity hover:opacity-100"
				>
					&times;
				</button>
			{/if}
		</div>
	</aside>
{/if}
