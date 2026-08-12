<script lang="ts">
	/**
	 * Stripe's embedded Checkout, mounted on our own page.
	 *
	 * The form lives in a Stripe-owned iframe, so card data goes straight to
	 * Stripe and this application stays out of PCI scope exactly as it was with
	 * the hosted page — the difference is only that the customer never leaves the
	 * site, which is where a redirect loses people.
	 */
	import { onDestroy } from 'svelte';

	let {
		clientSecret,
		publishableKey,
		loadingLabel
	}: { clientSecret: string; publishableKey: string; loadingLabel: string } = $props();

	let container = $state<HTMLDivElement | null>(null);
	let ready = $state(false);
	let failed = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let checkout: any = null;

	function loadStripeJs(): Promise<unknown> {
		const w = window as unknown as { Stripe?: unknown };
		if (w.Stripe) return Promise.resolve(w.Stripe);
		return new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>('script[data-stripe-js]');
			const script = existing ?? document.createElement('script');
			script.addEventListener('load', () => resolve((window as unknown as { Stripe: unknown }).Stripe));
			script.addEventListener('error', () => reject(new Error('Stripe.js failed to load')));
			if (!existing) {
				script.src = 'https://js.stripe.com/v3/';
				script.async = true;
				script.dataset.stripeJs = 'true';
				document.head.appendChild(script);
			}
		});
	}

	$effect(() => {
		if (!container || !clientSecret || !publishableKey) return;
		let cancelled = false;

		(async () => {
			try {
				const Stripe = (await loadStripeJs()) as (key: string) => {
					initEmbeddedCheckout(opts: { clientSecret: string }): Promise<{
						mount(el: HTMLElement): void;
						destroy(): void;
					}>;
				};
				if (cancelled) return;
				const instance = await Stripe(publishableKey).initEmbeddedCheckout({ clientSecret });
				if (cancelled) {
					instance.destroy();
					return;
				}
				checkout = instance;
				instance.mount(container!);
				ready = true;
			} catch (error) {
				console.error('Embedded checkout failed to mount', error);
				failed = true;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	// Stripe keeps an iframe and listeners alive; leaving them behind on a
	// client-side navigation leaks a payment session into the next page.
	onDestroy(() => {
		try {
			checkout?.destroy();
		} catch {
			/* already gone */
		}
	});
</script>

<div bind:this={container} class="min-h-[28rem]">
	{#if !ready && !failed}
		<p class="py-10 text-center text-sm text-ink-600">{loadingLabel}</p>
	{/if}
</div>
