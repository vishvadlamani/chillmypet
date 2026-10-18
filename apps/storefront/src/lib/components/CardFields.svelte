<script lang="ts">
	/**
	 * Stripe's Payment Element, mounted inline in the checkout form.
	 *
	 * Deferred-intent mode: the fields render from the page's own amount, before
	 * any order exists. That's what lets the card sit alongside the address
	 * instead of behind a second step — the intent is created when the form is
	 * submitted, and confirmed against these already-filled fields.
	 */
	import { onDestroy } from 'svelte';

	let {
		publishableKey,
		paymentMethodConfiguration,
		amountCents,
		currency,
		appearance,
		fonts,
		onready
	}: {
		publishableKey: string;
		/** Scopes which methods the form draws. Required here as well as on the
		 *  intent: in deferred mode the element renders before the intent exists,
		 *  so it reads this rather than the intent's method list. */
		paymentMethodConfiguration: string;
		amountCents: number;
		currency: string;
		/**
		 * Stripe's appearance object, for a page with its own look. Omitted, the
		 * fields keep the look every other checkout has.
		 */
		appearance?: Record<string, unknown>;
		/** Web fonts the appearance names; Stripe loads them inside its frame. */
		fonts?: { cssSrc: string }[];
		/**
		 * Hands the parent `submit` and `confirm`, or reports that Stripe is
		 * unusable. `submit` must be the first thing the Pay tap does (see
		 * below); `confirm` comes once the server has made the intent.
		 */
		onready: (api: { submit: SubmitFn; confirm: ConfirmFn } | null) => void;
	} = $props();

	export type ConfirmFn = (input: {
		clientSecret: string;
		returnUrl: string;
	}) => Promise<{ error?: { message?: string } }>;

	export type SubmitFn = () => Promise<{ error?: { message?: string } }>;

	let container = $state<HTMLDivElement | null>(null);
	let mounted = $state(false);
	// A tab other than Card is chosen. The box reserves the card form's height
	// so nothing below jumps while Stripe loads (Stripe's `ready` comes before
	// its final height, so the reserve can't simply end there); Apple Pay is a
	// line of text, and under the reserve it left a screen of empty box.
	let compact = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let stripe: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let elements: any = null;

	function injectStripeJs(): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://js.stripe.com/v3/';
			script.async = true;
			script.dataset.stripeJs = 'true';
			script.addEventListener('load', () => resolve((window as { Stripe?: unknown }).Stripe));
			script.addEventListener('error', () => {
				script.remove();
				reject(new Error('Stripe.js failed to load'));
			});
			document.head.appendChild(script);
		});
	}

	/**
	 * A failed script load is usually a flaky connection, not an ad blocker — and
	 * treating the two the same sends a payable customer to a redirect they did
	 * not need. Retry before giving up on the inline form.
	 */
	async function loadStripeJs(): Promise<unknown> {
		const w = window as unknown as { Stripe?: unknown };
		if (w.Stripe) return w.Stripe;

		const existing = document.querySelector<HTMLScriptElement>('script[data-stripe-js]');
		if (existing) {
			await new Promise<void>((resolve, reject) => {
				existing.addEventListener('load', () => resolve());
				existing.addEventListener('error', () => reject(new Error('Stripe.js failed to load')));
			});
			return (window as unknown as { Stripe?: unknown }).Stripe;
		}

		let lastError: unknown;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				const stripeGlobal = await injectStripeJs();
				if (stripeGlobal) return stripeGlobal;
				lastError = new Error('Stripe.js loaded without a global');
			} catch (error) {
				lastError = error;
			}
			await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
		}
		throw lastError ?? new Error('Stripe.js unavailable');
	}

	$effect(() => {
		if (!container || !publishableKey || amountCents <= 0 || mounted) return;
		let cancelled = false;

		(async () => {
			try {
				const Stripe = (await loadStripeJs()) as (key: string) => unknown;
				if (cancelled) return;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				stripe = Stripe(publishableKey) as any;
				elements = stripe.elements({
					mode: 'payment',
					amount: amountCents,
					currency: currency.toLowerCase(),
					...(paymentMethodConfiguration
						? { paymentMethodConfiguration }
						: {}),
					appearance: appearance ?? { theme: 'stripe', variables: { borderRadius: '8px' } },
					...(fonts ? { fonts } : {})
				});
				// Link off, on the owner's instruction (2026-10-17): it greets a
				// signed-in shopper with their own Link email above the card, which
				// read as the store showing a private address. Stripe's method
				// settings still list Link, and this wins over them here; the
				// hosted fallback page follows the settings alone.
				const element = elements.create('payment', {
					layout: 'tabs',
					wallets: { link: 'never' }
				});
				element.on('change', (event: { value?: { type?: string } }) => {
					compact = Boolean(event.value?.type) && event.value?.type !== 'card';
				});
				element.mount(container!);
				mounted = true;

				onready({
					// Validates the fields and collects what a wallet needs, before
					// the intent exists; Stripe requires it before confirmPayment in
					// deferred mode. For Apple Pay this is what opens the payment
					// sheet, and Safari opens it only from the tap itself, so the host
					// calls it first in the Pay handler, before the order is posted.
					// After the server's round trip the tap no longer counts and the
					// sheet fails (Stripe's own sample orders it the same way).
					submit: () => elements.submit(),
					confirm: async ({ clientSecret, returnUrl }) => {
						return stripe.confirmPayment({
							elements,
							clientSecret,
							confirmParams: { return_url: returnUrl },
							redirect: 'if_required'
						});
					}
				});
			} catch (error) {
				// A key from the wrong account, or an ad blocker eating
				// js.stripe.com — common on paid social. Tell the parent so it can
				// fall back rather than showing fields that will never work.
				console.error('Payment fields failed to mount', error);
				if (!cancelled) onready(null);
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	/**
	 * In deferred mode the element was created with the total at that moment.
	 * When the buyer then picks Express shipping or a second unit, the element
	 * has to be told: a wallet's payment sheet shows the element's amount, not
	 * the intent's, and the two must agree when the intent is confirmed.
	 */
	$effect(() => {
		const next = amountCents;
		if (!mounted || !elements || next <= 0) return;
		elements.update({ amount: next });
	});

	onDestroy(() => {
		try {
			elements?.getElement('payment')?.unmount();
		} catch {
			/* already gone */
		}
	});
</script>

<div bind:this={container} class={compact ? 'compact' : 'min-h-[12rem]'}></div>
