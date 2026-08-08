<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { createTranslator, defaultLocale, locales, localeName } from '$lib/i18n';
	import { cart } from '$lib/stores/cart.svelte';

	let { children } = $props();

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let year = new Date().getFullYear();

	$effect(() => {
		cart.hydrate();
	});
</script>

<div class="flex min-h-screen flex-col">
	<p class="bg-tide-700 px-4 py-2 text-center text-sm text-white">
		{t('announcement.banner', { discount: 30 })}
	</p>

	<header class="border-b border-ink-200">
		<nav
			class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4"
			aria-label={t('nav.shop')}
		>
			<a href="/" class="text-lg font-semibold tracking-tight">
				{t('common.brand')}
			</a>

			<ul class="flex items-center gap-5 text-sm text-ink-600">
				<li><a class="hover:text-ink-900" href="/">{t('nav.home')}</a></li>
				<li>
					<a class="hover:text-ink-900" href="/products/dog-life-jacket">{t('nav.shop')}</a>
				</li>
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
							{localeName(code)}
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
				<li><a class="hover:text-ink-900" href="/contact">{t('footer.contact')}</a></li>
			</ul>
			<p>{t('footer.rights', { year })}</p>
		</div>
	</footer>
</div>
