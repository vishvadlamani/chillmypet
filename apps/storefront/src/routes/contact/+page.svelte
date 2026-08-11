<script lang="ts">
	import { page } from '$app/state';
	import { createTranslator, defaultLocale, pack } from '$lib/i18n';

	const SUPPORT_EMAIL = 'contact@chillmypet.com';

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let doc = $derived(pack(locale).contactPage);
	let include = $derived(doc.include as string[]);
</script>

<svelte:head>
	<title>{doc.title} · {t('common.brand')}</title>
	<meta name="description" content={doc.intro} />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12">
	<h1 class="text-3xl font-semibold tracking-tight">{doc.title}</h1>
	<p class="mt-4 text-ink-600">{doc.intro}</p>

	<dl class="mt-10 space-y-5 rounded-2xl border border-ink-200 p-6">
		<div>
			<dt class="text-sm text-ink-600">{doc.emailLabel}</dt>
			<dd class="mt-1 text-lg font-medium">
				<a class="underline" href="mailto:{SUPPORT_EMAIL}">{SUPPORT_EMAIL}</a>
			</dd>
		</div>
		<div>
			<dt class="text-sm text-ink-600">{doc.responseLabel}</dt>
			<dd class="mt-1 font-medium">{doc.responseValue}</dd>
		</div>
	</dl>

	<section class="mt-10">
		<h2 class="text-lg font-medium">{doc.includeTitle}</h2>
		<ul class="mt-3 list-disc space-y-1.5 ps-5 text-ink-600">
			{#each include as item (item)}
				<li>{item}</li>
			{/each}
		</ul>
	</section>

	<a href="/" class="mt-10 inline-block text-sm font-medium underline">
		{t('policies.backHome')}
	</a>
</div>
