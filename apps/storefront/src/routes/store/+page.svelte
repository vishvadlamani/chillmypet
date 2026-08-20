<script lang="ts">
	import PageLayout from '@funnel/core/PageLayout.svelte';
	import { DR_BLOCKS } from '@funnel/blocks-dr';
	import type { FunnelStateAdapter, SubmitFn, TrackFn } from '@funnel/core';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const track: TrackFn = (event, subject, props) =>
		console.info('[track]', event, `${subject.component}#${subject.id}`, props ?? {});

	const submit: SubmitFn = (action, subject, payload) =>
		console.info('[submit]', action, `${subject.component}#${subject.id}`, payload ?? {});

	// Session-backed, because the top timer is evergreen: it writes its start on
	// first view and reads it back on every later one. A stub adapter would hand
	// each reload a fresh 15 minutes, which is the bug that makes evergreen
	// timers untrustworthy.
	const KEY = 'store-state';
	// `$state`, not a plain object. The adapter's reads are methods precisely so a
	// reactive host returns a live value on each call — blocks that mirror another
	// block's choice (the dock following the bundle picker) depend on that, and a
	// plain object leaves them frozen on whatever they saw first.
	const bag: Record<string, string> = $state(
		(() => {
			if (typeof sessionStorage === 'undefined') return {};
			try {
				return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
			} catch {
				return {};
			}
		})()
	);
	const persist = () => sessionStorage.setItem(KEY, JSON.stringify(bag));

	const funnelState: FunnelStateAdapter = {
		begin: () => {},
		get: (f) => bag[f] ?? '',
		set: (f, v) => {
			bag[f] = v;
			persist();
		},
		answer: (k) => bag[k] ?? '',
		setAnswer: (k, v) => {
			bag[k] = v;
			persist();
		},
		city: () => ''
	};
</script>

<svelte:head>
	<title>Store</title>
	<!--
		noindex while this is a work-in-progress on a production domain. The page
		currently quotes a price nothing can charge, shows placeholder photography
		and answers FAQs nobody has verified — none of which should turn up in
		search results under ideatorun.com. Delete this line when it's real.
	-->
	<!-- Poppins only on the storefront. Loaded here rather than in app.html so
	     /quiz and /checkout-dr* don't pay for a font they never render. -->
	<link
		href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<PageLayout
	definition={data.definition}
	version={data.version}
	components={DR_BLOCKS}
	{track}
	{submit}
	state={funnelState}
	rootClass="storefront-type bg-fx-bg min-h-svh"
	rowClass="mx-auto grid w-full max-w-shell gap-8 px-gutter py-6 md:grid-cols-[715fr_537fr] md:gap-12"
	colClass="flex flex-col gap-6"
/>

<style>
	/*
	 * Redefines the token for THIS SUBTREE ONLY.
	 *
	 * `--font-sans` is global and the live funnel renders through the same
	 * stylesheet — changing it in layout.css would restyle /quiz, /lp and
	 * /checkout-dr*, which must keep rendering identically. Scoping it to the
	 * page's root element means everything inside inherits Poppins and nothing
	 * outside notices.
	 *
	 * `:global` because the element carrying this class is rendered by
	 * PageLayout, not by this component, so Svelte's scoping wouldn't reach it.
	 */
	:global(.storefront-type) {
		--font-sans: 'Poppins', ui-sans-serif, system-ui, sans-serif;
		font-family: var(--font-sans);
	}
</style>
