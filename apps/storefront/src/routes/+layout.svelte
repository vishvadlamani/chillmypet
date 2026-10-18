<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { track } from '$lib/analytics/pixel';
	import { createTranslator, defaultLocale, locales, localeName } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';
	import { PAYMENT_ICONS, type PaymentMethod } from '$lib/store/payment-icons';
	// Scoped to `.tree-chrome`/`.tree-theme`, so loading it everywhere changes
	// nothing elsewhere, and a page with no styles of its own (contact) still
	// gets the shop's chrome.
	import '$lib/styles/tree-theme.css';

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
	const FOOTER_PAYMENTS: PaymentMethod[] = ['visa', 'mastercard', 'amex', 'applepay'];

	/**
	 * The shop's look, the tree storefront's cream and pine (after
	 * littletreepups.com), is the site's: every page wears it except a product
	 * page with a skin of its own (the life jacket's sales page, the pouch
	 * hoodie's `christmas` page) and the one-page checkouts under `/products/`,
	 * which keep the product page's top and their own chrome.
	 *
	 * Its strip sits ABOVE the header, the way a shop's own bar does, so the
	 * layout lifts the page's announcement up here and the theme hides the
	 * in-page copy. Still one strip, still the page's words: a manifest's
	 * `announcement_bar`, a page's own `announcement`, or else the site's
	 * Christmas delivery line from the layout's load.
	 */
	let treeChrome = $derived(
		page.data.theme === 'tree' ||
			(page.data.theme == null && !page.url.pathname.startsWith('/products/'))
	);

	/**
	 * The brand's own colours and type (navy, teal, orange, DM Sans; see the
	 * brand skin in `tree-theme.css`) on every tree-chrome page except the
	 * Christmas ones, which keep the pine and cream: `/christmas` and the
	 * products `pages.ts` flags `christmas` say so with `festive` in their data.
	 */
	let brandSkin = $derived(treeChrome && !page.data.festive);

	/**
	 * Block-rendered pages carry their own announcement strip, from the
	 * manifest, and the tree chrome lifts one above the header; the site's
	 * plain strip stands down for both, since two strips saying the same thing
	 * read as a mistake and cost the two lines of screen that matter most.
	 */
	let ownsAnnouncement = $derived(Boolean(page.data.definition) || treeChrome);
	let liftedStrip = $derived.by(() => {
		if (!treeChrome) return '';
		if (typeof page.data.announcement === 'string') return page.data.announcement;
		const blocks = (page.data.definition?.blocks ?? []) as {
			component: string;
			props?: { message?: unknown };
		}[];
		const message = blocks.find((b) => b.component === 'announcement_bar')?.props?.message;
		if (typeof message === 'string') return message;
		return page.data.siteAnnouncement ?? '';
	});

	/**
	 * Where the header gets out of the way. An ad lands on a product page, and
	 * on a phone in the Facebook app the header was three rows (name, language
	 * and cart, then the product links) above a photo, so the first screen held
	 * no price and nothing to tap. On a phone every page now keeps the name,
	 * the language and the cart on one row with the links behind a menu
	 * button; the checkouts drop the links everywhere, because a link out of a
	 * checkout is a way to not pay.
	 */
	let onCheckout = $derived(
		page.url.pathname === '/checkout' || /^\/products\/[^/]+\/checkout$/.test(page.url.pathname)
	);

	/**
	 * The shop checkout (`look: 'shop'`) brings the chrome of a hosted shop
	 * checkout: the name in the middle, a padlock where the cart would be, and
	 * no footer, because its policy links sit under its own pay button. The
	 * language switch stays off too: it is one more control above the email
	 * field, and the page that sends buyers here is English only.
	 */
	let shopChrome = $derived(page.data.look === 'shop' && onCheckout);

	/** The admin renders bare: no shop header, cart or footer around an order list. */
	let isAdmin = $derived(page.url.pathname === '/admin' || page.url.pathname.startsWith('/admin/'));

	$effect(() => {
		cart.hydrate();
	});

	/** The header's two menus: shut after a navigation, a tap elsewhere or Escape. */
	let catalogMenu = $state<HTMLDetailsElement>();
	let phoneMenu = $state<HTMLDetailsElement>();
	let inCatalog = $derived(
		page.url.pathname === '/catalog' ||
			page.url.pathname === '/christmas' ||
			page.url.pathname.startsWith('/products/')
	);
	afterNavigate(() => {
		for (const menu of [catalogMenu, phoneMenu]) if (menu) menu.open = false;
	});
	function closeMenus(event: Event) {
		for (const menu of [catalogMenu, phoneMenu]) {
			if (!menu?.open) continue;
			if (event instanceof KeyboardEvent) {
				if (event.key !== 'Escape') continue;
				menu.open = false;
				menu.querySelector('summary')?.focus();
			} else if (!menu.contains(event.target as Node)) {
				menu.open = false;
			}
		}
	}
</script>

<svelte:window onclick={closeMenus} onkeydown={closeMenus} />

<svelte:head>
	{#if brandSkin}
		<link
			href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
			rel="stylesheet"
		/>
	{:else if treeChrome}
		<link
			href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
			rel="stylesheet"
		/>
	{/if}
</svelte:head>

{#snippet languageSwitch(where: string)}
	<form method="POST" action="/locale" class="site-lang-form {where}">
		<input type="hidden" name="to" value={page.url.pathname} />
		<span class="sr-only">{t('nav.language')}</span>
		{#each locales as code (code)}
			<button
				type="submit"
				name="locale"
				value={code}
				aria-current={code === locale ? 'true' : undefined}
				class="site-lang"
			>
				<!-- The two-letter code on a phone, so the bar keeps to one row. -->
				<span class="sm:hidden" aria-hidden="true">{code}</span>
				<span class="max-sm:sr-only">{localeName(code)}</span>
			</button>
		{/each}
	</form>
{/snippet}

{#if isAdmin}
	{@render children()}
{:else if shopChrome}
<div class="flex min-h-screen flex-col">
	<header class="shop-header">
		<span class="shop-header-side" aria-hidden="true"></span>
		<a href="/" class="shop-wordmark">
			<!-- The owner's logo, as in the site header. -->
			<img src="/brand/logo.png" alt={t('common.brand')} width="449" height="96" />
		</a>
		<span class="shop-header-side shop-secure">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
				<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
			</svg>
			<span class="max-sm:sr-only">{t('checkout.shop.secure')}</span>
		</span>
	</header>
	<main class="flex-1">
		{@render children()}
	</main>
</div>
{:else}
<div class="flex min-h-screen flex-col" class:tree-chrome={treeChrome} class:brand-skin={brandSkin}>
	{#if liftedStrip}
		<p class="tree-strip">{liftedStrip}</p>
	{/if}
	{#if !ownsAnnouncement}
		<p class="bg-tide-700 px-4 py-2 text-center text-sm text-white">
			{t('announcement.banner', { discount: 30 })}
		</p>
	{/if}

	<header class="site-header border-b border-ink-200">
		<nav class="site-nav" aria-label={t('nav.shop')}>
			<!-- Below 768px the menu folds behind a button, the way shops do on a
			     phone: the name, the language and the cart keep one row, and the
			     first screen keeps its room for the product. Never on a checkout:
			     a link out of a checkout is a way to not pay. -->
			{#if !onCheckout}
				<details class="phone-menu" bind:this={phoneMenu}>
					<summary aria-label={t('nav.menu')}>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
						</svg>
					</summary>
					<ul>
						<li><a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>{t('nav.home')}</a></li>
						<li><a href="/catalog" aria-current={page.url.pathname === '/catalog' ? 'page' : undefined}>{t('nav.allProducts')}</a></li>
						{#if page.data.christmasShop}
							<li><a href="/christmas" aria-current={page.url.pathname === '/christmas' ? 'page' : undefined}>{t('nav.christmas')}</a></li>
						{/if}
						<li><a href="/contact" aria-current={page.url.pathname === '/contact' ? 'page' : undefined}>{t('nav.contact')}</a></li>
						<li class="phone-menu-lang">{@render languageSwitch('in-menu')}</li>
					</ul>
				</details>
			{/if}

			<!-- Home, Catalog, Contact, the way a shop's menu reads. The products
			     live under Catalog rather than in the bar: four product names
			     were too long for one row. -->
			<ul class="{onCheckout ? 'hidden' : 'flex'} site-menu">
				<li>
					<a href="/" aria-current={page.url.pathname === '/' ? 'page' : undefined}>
						{t('nav.home')}
					</a>
				</li>
				<li>
					<!-- A disclosure, not a hover menu: a tap opens it on a tablet,
					     it works before hydration, and Escape or a tap elsewhere
					     closes it. -->
					<details class="catalog-menu" bind:this={catalogMenu}>
						<summary class:active={inCatalog}>
							{t('nav.catalog')}
							<svg viewBox="0 0 12 12" aria-hidden="true">
								<path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" />
							</svg>
						</summary>
						<ul>
							<li>
								<a
									href="/catalog"
									aria-current={page.url.pathname === '/catalog' ? 'page' : undefined}
								>
									{t('nav.allProducts')}
								</a>
							</li>
							{#if page.data.christmasShop}
								<li>
									<a
										href="/christmas"
										aria-current={page.url.pathname === '/christmas' ? 'page' : undefined}
									>
										{t('nav.christmas')}
									</a>
								</li>
							{/if}
						</ul>
					</details>
				</li>
				<li>
					<a href="/contact" aria-current={page.url.pathname === '/contact' ? 'page' : undefined}>
						{t('nav.contact')}
					</a>
				</li>
			</ul>

			{#if onCheckout}{@render languageSwitch('in-bar keep lead')}{/if}

			<a href="/" class="site-brand">
				<!-- The owner's logo, paw and wordmark side by side (static/brand). -->
				<img src="/brand/logo.png" alt={t('common.brand')} width="449" height="96" />
			</a>

			<div class="site-tools">
				<!-- On a phone the switch lives in the menu. A checkout has no menu,
				     so there it takes the menu's empty slot on the left instead. -->
				{#if !onCheckout}{@render languageSwitch('in-bar')}{/if}

				<a href="/checkout" class="site-cart">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3L5 8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
						<path d="M9 10V6.5a3 3 0 0 1 6 0V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
					</svg>
					<span class="sr-only">{t('nav.cart')}</span>
					<span class="site-cart-count">{cart.count}</span>
				</a>
			</div>
		</nav>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="site-footer">
		<div class="site-footer-inner">
			<div class="site-footer-brand">
				<a href="/" class="site-footer-name">
					<!-- Light lettering for the dark tree and brand footers; the plain
					     chrome's footer is light, and needs the navy logo. -->
					<img
						src={treeChrome ? '/brand/logo-light.png' : '/brand/logo.png'}
						alt={t('common.brand')}
						width="449"
						height="96"
					/>
				</a>
				<p>{t('footer.tagline')}</p>
			</div>
			<div>
				<h2>{t('footer.shop')}</h2>
				<ul>
					<li><a href="/catalog">{t('nav.allProducts')}</a></li>
					{#if page.data.christmasShop}
						<li><a href="/christmas">{t('nav.christmas')}</a></li>
					{/if}
				</ul>
			</div>
			<div>
				<h2>{t('footer.help')}</h2>
				<ul>
					<li><a href="/contact">{t('footer.contact')}</a></li>
					<li><a href="/policies/shipping">{t('footer.shipping')}</a></li>
					<li><a href="/policies/refunds">{t('footer.refunds')}</a></li>
				</ul>
			</div>
			<div>
				<h2>{t('footer.legal')}</h2>
				<ul>
					<li><a href="/privacy">{t('footer.privacy')}</a></li>
					<li><a href="/terms">{t('footer.terms')}</a></li>
				</ul>
			</div>
		</div>
		<div class="site-footer-base">
			<!-- The methods the checkout really offers (see AGENTS.md: Google Pay
			     is off in Stripe, and a Czech account gets no Discover). -->
			<ul class="site-footer-pay" aria-label="Accepted payment methods">
				{#each FOOTER_PAYMENTS as m (m)}
					<li role="img" aria-label={PAYMENT_ICONS[m].label}>{@html PAYMENT_ICONS[m].svg}</li>
				{/each}
			</ul>
			<p>{t('footer.rights', { year })}</p>
		</div>
	</footer>
</div>
{/if}

