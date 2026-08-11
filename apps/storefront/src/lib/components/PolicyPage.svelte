<script lang="ts">
	import { page } from '$app/state';
	import { createTranslator, defaultLocale, pack } from '$lib/i18n';

	type Section = { heading: string; body: string[] };

	// `which` names the document inside the language pack. Sections are read off
	// pack() rather than t(): they are arrays, and the translator only resolves
	// string leaves.
	let { which }: { which: 'shipping' | 'refunds' | 'privacy' | 'terms' } = $props();

	const SUPPORT_EMAIL = 'contact@chillmypet.com';

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));
	let doc = $derived(pack(locale).policies[which]);
	let sections = $derived(doc.sections as Section[]);

	// The support address appears in body copy across four documents and two
	// languages; substituting keeps it in one place.
	const withEmail = (text: string) => text.replaceAll('{email}', SUPPORT_EMAIL);
</script>

<svelte:head>
	<title>{doc.title} · {t('common.brand')}</title>
	<meta
		name="description"
		content={withEmail(sections[0]?.body[0] ?? '').slice(0, 155)}
	/>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12">
	<h1 class="text-3xl font-semibold tracking-tight">{doc.title}</h1>

	<div class="mt-10 space-y-9">
		{#each sections as section (section.heading)}
			<section>
				<h2 class="text-lg font-medium">{section.heading}</h2>
				{#each section.body as paragraph (paragraph)}
					<p class="mt-3 text-ink-600">{withEmail(paragraph)}</p>
				{/each}
			</section>
		{/each}
	</div>

	<p class="mt-12 border-t border-ink-200 pt-6 text-sm text-ink-600">
		{withEmail(t('policies.questions'))}
	</p>

	<a href="/" class="mt-8 inline-block text-sm font-medium underline">
		{t('policies.backHome')}
	</a>
</div>
