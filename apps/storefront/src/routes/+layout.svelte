<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { track } from '$lib/analytics/pixel';
	import { createTranslator, defaultLocale, locales, localeName } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';

	let { children } = $props();

	// The snippet in app.html fires PageView for the initial load only; client-side
	// navigations would otherwise go unrecorded.
	afterNavigate((navigation) => {
		if (navigation.type === 'enter') return;
		// The admin loads no pixel, and its page views are not a shopper's.
		if (isAdmin) return;
		// Plain, not scoped: every pixel is initialised by the snippet in
		// app.html, so one call gives each of them exactly one PageView.
		track('PageView');
	});

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let year = new Date().getFullYear();

	/**
	 * Block-rendered pages carry their own announcement strip, from the manifest.
	 * Site chrome and page content stating the same offer one above the other
	 * reads as a mistake, and on a landing page it costs the two lines of screen
	 * that matter most — so the site's strip stands down where a page brings its
	 * own. A page is one of those if its data carries a definition.
	 */
	let ownsAnnouncement = $derived(Boolean(page.data.definition));

	/**
	 * The tree storefront (the costume page) sets its strip ABOVE the header,
	 * the way a shop's own bar sits, so the layout lifts the page's announcement
	 * up here and the theme hides the in-page copy. Still one strip, still the
	 * page's words.
	 */
	let treeChrome = $derived(page.data.theme === 'tree');
	let liftedStrip = $derived.by(() => {
		if (!treeChrome) return '';
		const blocks = (page.data.definition?.blocks ?? []) as {
			component: string;
			props?: { message?: unknown };
		}[];
		const message = blocks.find((b) => b.component === 'announcement_bar')?.props?.message;
		return typeof message === 'string' ? message : '';
	});

	/**
	 * Where the header gets out of the way. An ad lands on a product page, and
	 * on a phone in the Facebook app the header was three rows (name, language
	 * and cart, then the product links) above a photo, so the first screen held
	 * no price and nothing to tap. On a phone those pages keep the name, the
	 * language and the cart on one row and drop the links; the checkouts drop
	 * them everywhere, because a link out of a checkout is a way to not pay.
	 */
	let onProduct = $derived(page.url.pathname.startsWith('/products/'));
	let onCheckout = $derived(
		page.url.pathname === '/checkout' || /^\/products\/[^/]+\/checkout$/.test(page.url.pathname)
	);

	/** The admin renders bare: no shop header, cart or footer around an order list. */
	let isAdmin = $derived(page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/'));

	$effect(() => {
		cart.hydrate();
	});
</script>

{#if isAdmin}
	{@render children()}
{:else}
<div class="flex min-h-screen flex-col" class:tree-chrome={treeChrome}>
	{#if liftedStrip}
		<p class="tree-strip">{liftedStrip}</p>
	{/if}
	{#if !ownsAnnouncement}
		<p class="bg-tide-700 px-4 py-2 text-center text-sm text-white">
			{t('announcement.banner', { discount: 30 })}
		</p>
	{/if}

	<header class="border-b border-ink-200">
		<nav
			class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4"
			aria-label={t('nav.shop')}
		>
			<a href="/" class="text-lg font-semibold tracking-tight">
				{t('common.brand')}
			</a>

			<!-- On a phone the product names no longer fit beside the brand, and
			     three of them wrapped the header onto three lines. Below `sm` the
			     list takes its own line and scrolls sideways instead of wrapping;
			     the negative margin lets the first link start at the gutter. -->
			<ul
				class="{onCheckout ? 'hidden' : onProduct ? 'flex max-sm:hidden' : 'flex'} items-center gap-x-5 overflow-x-auto whitespace-nowrap text-sm text-ink-600 [scrollbar-width:none] max-sm:order-last max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:px-4 [&::-webkit-scrollbar]:hidden"
			>
				<li><a class="hover:text-ink-900" href="/">{t('nav.home')}</a></li>
				<!-- One link per product that can actually be bought here, from the
				     layout's load: the catalogue decides, so a second product is
				     reachable the day its row lands and never before. -->
				{#each page.data.nav ?? [] as item (item.slug)}
					<li>
						<a
							class="hover:text-ink-900"
							href="/products/{item.slug}"
							aria-current={page.url.pathname === `/products/${item.slug}` ? 'page' : undefined}
						>
							{item.title}
						</a>
					</li>
				{/each}
			</ul>

			<div class="ms-auto flex items-center gap-4">
				<form method="POST" action="/locale" class="flex items-center gap-1">
					<input type="hidden" name="to" value={page.url.pathname} />
					<span class="sr-only">{t('nav.language')}</span>
					{#each locales as code (code)}
						<button
							type="submit"
							name="locale"
							value={code}
							aria-current={code === locale ? 'true' : undefined}
							class="rounded px-2 py-1 text-xs uppercase transition
								{code === locale
								? 'bg-ink-100 font-semibold text-ink-900'
								: 'text-ink-400 hover:text-ink-900'}"
						>
							<!-- The two-letter code on a phone, so the language and the cart
							     fit on the brand's row. -->
							<span class="sm:hidden" aria-hidden="true">{code}</span>
							<span class="max-sm:sr-only">{localeName(code)}</span>
						</button>
					{/each}
				</form>

				<a
					href="/checkout"
					class="flex items-center gap-2 text-sm font-medium hover:text-tide-600"
				>
					{t('nav.cart')}
					<span
						class="inline-flex min-w-6 justify-center rounded-full bg-ink-900 px-2 py-0.5 text-xs text-white"
					>
						{cart.count}
					</span>
				</a>
			</div>
		</nav>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-20 border-t border-ink-200 bg-ink-50">
		<div
			class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between"
		>
			<ul class="flex flex-wrap gap-5">
				<li><a class="hover:text-ink-900" href="/policies/shipping">{t('footer.shipping')}</a></li>
				<li><a class="hover:text-ink-900" href="/policies/refunds">{t('footer.refunds')}</a></li>
				<li><a class="hover:text-ink-900" href="/privacy">{t('footer.privacy')}</a></li>
				<li><a class="hover:text-ink-900" href="/terms">{t('footer.terms')}</a></li>
				<li><a class="hover:text-ink-900" href="/contact">{t('footer.contact')}</a></li>
			</ul>
			<p>{t('footer.rights', { year })}</p>
		</div>
	</footer>
</div>
{/if}
