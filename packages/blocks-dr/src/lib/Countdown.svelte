<script lang="ts">
	import { untrack } from 'svelte';
	import type { Block, FlowContext } from '@funnel/core';
	import { fill, monthName } from './tokens';

	/**
	 * `countdown` — one block, four presentations.
	 *
	 * A countdown shows up all over a DR funnel: a full-bleed banner at the top, a
	 * boxed unit near an offer, a single line beside a checkout button. What's
	 * actually hard is the same in every case — resolving a real deadline, ticking
	 * without the digits jittering, persisting an evergreen window, and deciding
	 * what happens at zero. Splitting that across several blocks duplicates the
	 * timer and every expiry edge case, so presentation is a prop instead.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived(
		(block.props ?? {}) as {
			/** ISO deadline — usually a `$ref` to a real sale end, not a literal. */
			endsAt?: string;
			/**
			 * Per-visitor window in minutes, timed from first view and persisted, for
			 * offers that aren't a shared calendar deadline. Ignored when `endsAt` is set.
			 */
			durationMinutes?: number;
			/** `{month}` is substituted — "August Sale" must not be a literal. */
			headline?: string;
			/** Language for `{month}`. Fixed default so SSR and the client agree. */
			locale?: string;
			variant?: 'banner' | 'chips' | 'stacked' | 'inline' | 'bare';
			/** `chips` only — numeral colour and the chip's own fill. */
			digitColor?: string;
			chipBg?: string;
			/** Accent rule under the strip. */
			underline?: string;
			uppercase?: boolean;
			size?: 'sm' | 'md' | 'lg';
			tone?: 'dark' | 'green' | 'red' | 'light' | 'bare';
			bg?: string;
			fg?: string;
			font?: 'sans' | 'serif' | 'mono';
			/** Unit captions — overridable for locale or brevity. */
			labels?: { days?: string; hours?: string; mins?: string; secs?: string };
			/** Show a days column. 'auto' only shows it past 24h. */
			showDays?: boolean | 'auto';
			/** Show an hours column. 'auto' drops it once under an hour. */
			showHours?: boolean | 'auto';
			/**
			 * `restart` begins a fresh window at zero — evergreen only, since a real
			 * calendar deadline can't be restarted.
			 */
			onExpire?: 'hide' | 'zeros' | 'message' | 'restart';
			expiredMessage?: string;
			/** Line that precedes the digits in `inline`. */
			prefix?: string;
		}
	);

	const L = $derived({
		days: p.labels?.days ?? 'Days',
		hours: p.labels?.hours ?? 'Hrs',
		mins: p.labels?.mins ?? 'Mins',
		secs: p.labels?.secs ?? 'Secs'
	});

	// ── Deadline ──────────────────────────────────────────────────────────────
	const STORE_KEY = $derived(`cd_${block.id}`);

	/**
	 * Restart is evergreen-only, and the guard is not pedantic: `endsAt` is a
	 * fixed instant, so restarting from it would land in the past, expire on the
	 * same frame, and restart again — a render loop that pins a core.
	 */
	const restarts = $derived(p.onExpire === 'restart' && !p.endsAt && !!p.durationMinutes);
	$effect(() => {
		if (p.onExpire === 'restart' && !restarts) {
			console.warn(
				`[funnel] countdown "${block.id}": onExpire "restart" needs durationMinutes and no endsAt — falling back to zeros`
			);
		}
	});

	/** Resolve the deadline. Evergreen windows persist their start via the host. */
	function deadline(): number {
		if (p.endsAt) {
			const t = Date.parse(p.endsAt);
			return Number.isNaN(t) ? 0 : t;
		}
		if (p.durationMinutes) {
			const span = p.durationMinutes * 60_000;
			const saved = Number(ctx.state.answer(STORE_KEY));
			let start = saved > 0 ? saved : Date.now();
			// A window that already ran out while the visitor was away restarts HERE,
			// during resolution, rather than being rendered at 00:00 and restarted by
			// the expiry effect a frame later — otherwise every return visit opens on
			// a flash of a dead offer.
			if (restarts && start + span <= Date.now()) start = Date.now();
			if (start !== saved) ctx.state.setAnswer(STORE_KEY, String(start));
			return start + span;
		}
		return 0;
	}

	let endsMs = $state(0);
	let now = $state(0);
	/** Bumped to re-resolve the deadline; the effect below reads it as a trigger. */
	let cycle = $state(0);

	$effect(() => {
		cycle;
		// Deadline resolution touches host state — untracked so it doesn't re-run
		// every tick and re-stamp the evergreen start.
		const end = untrack(() => deadline());
		endsMs = end;
		now = Date.now();
		if (!end) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		// A 1s interval notices the deadline up to a second late, which on a
		// restarting timer is an extra second of dead 00:00 on top of the one the
		// last second legitimately shows. Land on the deadline itself.
		const left = end - Date.now();
		const at = left > 0 ? setTimeout(() => (now = Date.now()), left + 20) : undefined;
		return () => {
			clearInterval(id);
			if (at !== undefined) clearTimeout(at);
		};
	});

	const remaining = $derived(endsMs && now ? Math.max(0, endsMs - now) : 0);
	const expired = $derived(Boolean(endsMs) && now > 0 && remaining === 0);

	const t = $derived.by(() => {
		const s = Math.floor(remaining / 1000);
		return {
			d: Math.floor(s / 86400),
			h: Math.floor((s % 86400) / 3600),
			m: Math.floor((s % 3600) / 60),
			s: s % 60
		};
	});

	const withDays = $derived(p.showDays === true || (p.showDays !== false && t.d > 0));
	const pad = (n: number) => String(n).padStart(2, '0');

	/**
	 * Drop leading units that are zero rather than padding them out. `00 Hrs`
	 * next to `40 Mins` reads as a dead column and steals emphasis from the number
	 * that's actually moving.
	 */
	const withHours = $derived(
		p.showHours === true || (p.showHours !== false && (withDays || t.d > 0 || t.h > 0))
	);

	const units = $derived([
		...(withDays ? [{ v: pad(t.d), label: L.days }] : []),
		...(withHours ? [{ v: pad(withDays ? t.h : t.d * 24 + t.h), label: L.hours }] : []),
		{ v: pad(t.m), label: L.mins },
		{ v: pad(t.s), label: L.secs }
	]);

	/**
	 * Fire once, and only on a real transition from live → expired.
	 *
	 * Firing whenever `expired` is true means every visitor who loads a page with
	 * an already-dead offer emits an expiry event. The metric then measures
	 * pageviews of stale offers, not offers expiring — and it looks like they're
	 * expiring constantly. `sawLive` gates it on having actually seen it running.
	 */
	let sawLive = false;
	let announced = false;
	$effect(() => {
		if (!endsMs || now === 0) return;
		if (!expired) {
			sawLive = true;
			return;
		}
		if (!sawLive) return;

		if (restarts) {
			// Cleared before the write so a re-run in the same tick can't restart
			// twice off one expiry.
			sawLive = false;
			untrack(() => {
				ctx.state.setAnswer(STORE_KEY, String(Date.now()));
				// Its own event, not `countdown_expired`. A restarting timer is one
				// the visitor never saw die, and counting it as an expiry would
				// inflate that metric once per window for anyone idling on the tab.
				ctx.track('countdown_restart');
			});
			cycle++;
			return;
		}

		if (!announced) {
			announced = true;
			untrack(() => ctx.track('countdown_expired'));
		}
	});

	// ── Presentation ──────────────────────────────────────────────────────────
	const TONES = {
		dark: 'bg-[#2b2b2b] text-white',
		green: 'bg-[#22301a] text-white',
		red: 'bg-[#3a1414] text-white',
		light: 'bg-fx-surface text-fx-ink',
		bare: ''
	};
	// 13 → 21 is the golden step, and the number is the message: a headline at
	// the same size fights it. The label sits below both at 11.
	const HEAD = { sm: 'text-11', md: 'text-13', lg: 'text-17' };
	const DIGIT = { sm: 'text-17', md: 'text-21', lg: 'text-33' };
	const FONTS = { sans: 'font-sans', serif: 'font-serif', mono: 'font-mono' };

	const headline = $derived(p.headline ? fill(p.headline, { month: monthName(p.locale) }) : '');
	const variant = $derived(p.variant ?? 'banner');
	const toneClass = $derived(p.bg ? '' : (TONES[p.tone ?? 'dark'] ?? TONES.dark));
	const headClass = $derived(HEAD[p.size ?? 'md'] ?? HEAD.md);
	const digitClass = $derived(DIGIT[p.size ?? 'md'] ?? DIGIT.md);
	const fontClass = $derived(FONTS[p.font ?? 'sans'] ?? FONTS.sans);

	// tabular-nums is not cosmetic: without it the row reflows every second as
	// digit widths change, and the whole thing visibly twitches.
	const DIGITS = 'font-bold tabular-nums leading-none tracking-headline';
	const LABEL = 'text-11 tracking-label opacity-70';
	const hidden = $derived(expired && (p.onExpire ?? 'hide') === 'hide');
</script>

{#if !hidden && (endsMs || p.onExpire === 'message')}
	{#if variant === 'bare'}
		<span class="{digitClass} {DIGITS} {fontClass}">
			{units.map((u) => u.v).join(':')}
		</span>
	{:else if variant === 'inline'}
		<!-- Inherits its size from the surrounding copy on purpose: `inline` exists
		     to sit inside someone else's sentence, and forcing a size there
		     rendered an 11px clock in the middle of 15px body text. Weight and
		     colour carry the emphasis instead. -->
		<span class="{fontClass} inline-flex items-baseline gap-2">
			{#if expired && p.onExpire === 'message'}
				{p.expiredMessage ?? 'Offer closed'}
			{:else}
				{#if p.prefix}<span>{p.prefix}</span>{/if}
				<span class="font-bold tabular-nums" style:color={p.digitColor}
					>{units.map((u) => u.v).join(':')}</span
				>
			{/if}
		</span>
	{:else}
		<!-- banner + stacked share the strip; only the axis differs -->
		<aside
			aria-label="Offer countdown"
			class="w-full {toneClass} {fontClass} text-13"
			style:background={p.bg}
			style:color={p.fg}
			style:border-bottom={p.underline ? `2px solid ${p.underline}` : undefined}
		>
			<div
				class="mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-gutter py-2 text-center {variant ===
				'stacked'
					? 'flex-col'
					: ''}"
			>
				{#if expired && p.onExpire === 'message'}
					<p class="{headClass} font-light">{p.expiredMessage ?? 'This offer has closed'}</p>
				{:else}
					{#if headline}
						<p
							class="{headClass} font-bold text-balance {p.uppercase
								? 'tracking-label uppercase'
								: 'tracking-headline'}"
						>
							{headline}
						</p>
					{/if}

					<!-- aria-hidden on the ticking row; a screen reader gets one calm
					     sentence instead of a per-second barrage. -->
					<div class="flex items-center gap-1" aria-hidden="true">
						{#each units as u, i (u.label)}
							{#if i > 0}
								<span
									class="{digitClass} {DIGITS} opacity-40"
									style:color={variant === 'chips' ? p.digitColor : undefined}>:</span
								>
							{/if}
							{#if variant === 'chips'}
								<!-- Unit label sits inside the chip: at a glance the number and
								     its unit read as one object rather than two rows of text. -->
								<span
									class="flex flex-col items-center rounded-[8px] px-2 py-1"
									style:background={p.chipBg ?? 'rgba(255,255,255,.08)'}
								>
									<span class="{digitClass} {DIGITS}" style:color={p.digitColor}>{u.v}</span>
									<span class="{LABEL} uppercase">{u.label}</span>
								</span>
							{:else}
								<span class="flex flex-col items-center gap-1">
									<span class="{digitClass} {DIGITS}">{u.v}</span>
									<span class={LABEL}>{u.label}</span>
								</span>
							{/if}
						{/each}
					</div>
					<span class="sr-only">
						{units.map((u) => `${Number(u.v)} ${u.label}`).join(', ')} remaining
					</span>
				{/if}
			</div>
		</aside>
	{/if}
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
