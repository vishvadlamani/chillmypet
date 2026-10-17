<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import type { Block, FlowContext } from '@funnel/core';
	import ShopField from '$lib/components/ShopField.svelte';
	import { fieldProblem } from '$lib/checkout-fields';
	import { createTranslator, defaultLocale } from '$lib/i18n';

	/**
	 * The shop checkout's Contact section: the email, and what it is for.
	 *
	 * Email first, alone, because it is the field worth having if the buyer
	 * stops here: it is where the receipt goes, and the one reminder the note
	 * promises (keep that note; it is what makes the reminder fair to send).
	 * No "email me with news" box. The reference ticks one in advance, and a
	 * pre-ticked box is not consent where the seller is (Czechia, the EU).
	 *
	 * Writes `email` into host state as it is typed, like the library's
	 * contact form, so the checkout's draft capture and InitiateCheckout see
	 * it without a button.
	 */
	let { block, ctx }: { block: Block; ctx: FlowContext } = $props();

	const p = $derived((block.props ?? {}) as { heading?: string; note?: string });
	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));

	let email = $derived(ctx.state.get('email'));
	let touched = $state(false);
	// The host writes a fresh token here each time pay is pressed with
	// something missing. A token left over from an earlier visit is not a
	// press anyone made on this page, so only a change from it counts.
	const attemptAtStart = untrack(() => ctx.state.get('checkout_attempt'));
	let attempted = $derived(ctx.state.get('checkout_attempt') !== attemptAtStart);

	let problem = $derived(fieldProblem('email', email));
	let shown = $derived((touched || attempted) && problem ? t(problem) : '');
</script>

<section class="shop-section" aria-labelledby="shop-contact-title">
	<h2 id="shop-contact-title">{p.heading ?? t('checkout.contactTitle')}</h2>
	<ShopField
		id="contact-email"
		label={t('checkout.email')}
		type="email"
		autocomplete="email"
		inputmode="email"
		value={email}
		error={shown}
		hint={p.note ?? ''}
		oninput={(v) => ctx.state.set('email', v.trim())}
		onblur={() => (touched = email.length > 0 || touched)}
	/>
</section>
