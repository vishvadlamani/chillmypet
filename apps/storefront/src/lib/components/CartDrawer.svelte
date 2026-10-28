<script lang="ts">
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import QuantityStepper from '$lib/components/QuantityStepper.svelte';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { resized } from '$lib/resized';
	import { cart } from '$lib/stores/cart.svelte';

	/**
	 * The basket the header's bag opens, from the right, over the page.
	 *
	 * The bag used to go straight to `/checkout`, where the lines and their
	 * − + buttons sit under the address and card fields, so changing how many
	 * of something you were buying meant scrolling past a whole form. Here
	 * each line has its stepper and Remove at the top of a short panel, and
	 * Checkout goes on from it. Without JavaScript the bag is still the plain
	 * link to `/checkout`.
	 *
	 * The lines come from the cart in the browser, so they can be changed the
	 * moment the panel opens, whatever the network is doing. Each change is
	 * re-priced through `/api/cart`, which also gives the title and photo a
	 * cart line doesn't carry; the cart's own prices are display-only and
	 * stand in until it answers. The order is priced on the server either way.
	 */
	let dialog = $state<HTMLDialogElement>();
	let isOpen = $state(false);

	export function open() {
		if (!dialog || dialog.open) return;
		dialog.showModal();
		isOpen = true;
	}
	function close() {
		dialog?.close();
	}

	afterNavigate(close);

	type PricedLine = {
		variantId: number;
		slug: string;
		title: string;
		colour: string;
		size: string;
		image: string | null;
		unitPriceCents: number;
	};
	type Priced = {
		lines: PricedLine[];
		discountCents: number;
		bundlePercentOff: number;
		bogoDiscountCents?: number;
		currency: string;
	};

	let t = $derived(createTranslator(page.data.locale ?? defaultLocale));
	let locale = $derived(page.data.locale ?? defaultLocale);
	let priced = $state<Priced | null>(null);
	// The cart this answer priced, so a discount for 3 units never sits under 2.
	let pricedKey = $state('');
	// Set when the last re-price failed. The lines stay on screen and editable,
	// with a note and Try again: a slow or broken /api/cart (a timeout, an
	// error page such as a 1101, a dropped connection) once left nothing but
	// "Loading…", so a full bag could not be changed at all.
	let failed = $state(false);
	let attempt = $state(0);

	// A request that never settles counts as failed after this long.
	const PRICE_TIMEOUT_MS = 10_000;

	/**
	 * What the server last said about each variant (title, photo), kept in
	 * the browser, so the lines open with their names and photos at once on
	 * any page rather than after the round trip. Display only, like the cart.
	 */
	const DESCRIBED_KEY = 'chillmypet.cart.described.v1';
	type Described = Record<number, { title: string; image: string | null }>;
	let described = $state<Described>(readDescribed());

	function readDescribed(): Described {
		if (!browser) return {};
		try {
			const parsed = JSON.parse(localStorage.getItem(DESCRIBED_KEY) ?? '{}');
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	}

	function remember(pricedLines: PricedLine[]) {
		const next: Described = {};
		for (const line of cart.lines) if (described[line.variantId]) next[line.variantId] = described[line.variantId];
		for (const line of pricedLines) next[line.variantId] = { title: line.title, image: line.image };
		described = next;
		try {
			localStorage.setItem(DESCRIBED_KEY, JSON.stringify(next));
		} catch {
			// Private browsing or a full quota: the names come from the server instead.
		}
	}

	const keyOf = (payload: { variantId: number; quantity: number }[]) =>
		payload.map((l) => `${l.variantId}x${l.quantity}`).join(',');

	// Priced only while open: the bag is on every page, and a fetch per page
	// view for a panel nobody opened is not worth it.
	$effect(() => {
		if (!isOpen || !cart.hydrated) return;
		void attempt;
		const payload = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
		if (payload.length === 0) return;

		let cancelled = false;
		failed = false;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), PRICE_TIMEOUT_MS);
		fetch('/api/cart', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lines: payload }),
			signal: controller.signal
		})
			.then((res) => {
				if (!res.ok) throw new Error(`cart ${res.status}`);
				return res.json();
			})
			.then((data) => {
				if (cancelled) return;
				if (!Array.isArray(data?.lines)) throw new Error('cart: no lines');
				priced = data;
				pricedKey = keyOf(payload);
				remember(data.lines);
				// A line the server no longer prices is a product taken off sale
				// still saved in this browser. Drop it, as the checkout does, or
				// the count says 10 over lines that add up to 7.
				const sold = new Set(data.lines.map((l: PricedLine) => l.variantId));
				for (const line of cart.lines) if (!sold.has(line.variantId)) cart.remove(line.variantId);
			})
			.catch(() => {
				// The lines stay as they are; the checkout prices them again anyway.
				if (!cancelled) failed = true;
			})
			.finally(() => clearTimeout(timer));
		return () => {
			cancelled = true;
			clearTimeout(timer);
			controller.abort();
		};
	});

	/** "calming-massager" → "Calming massager", until the server names it. */
	const titleFromSlug = (slug: string) => {
		const words = slug.replace(/-/g, ' ');
		return words.charAt(0).toUpperCase() + words.slice(1);
	};

	// Drawn from the cart itself, so the lines, their − + and Remove are there
	// the moment the drawer opens and never wait on the network. The server's
	// answer fills in the title, photo and price as it arrives; the count
	// follows the tap at once rather than when the re-price comes back.
	let lines = $derived(
		cart.lines.map((line) => {
			const fresh = priced?.lines.find((l) => l.variantId === line.variantId);
			const known = fresh ?? described[line.variantId];
			return {
				variantId: line.variantId,
				slug: line.slug,
				title: known?.title ?? titleFromSlug(line.slug),
				colour: line.colour,
				size: line.size,
				image: known?.image ?? null,
				unitPriceCents: fresh?.unitPriceCents ?? line.unitPriceCents,
				quantity: line.quantity
			};
		})
	);
	let currency = $derived(priced?.currency ?? 'USD');
	let subtotalCents = $derived(lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0));
	// Only for the cart it was worked out on; after a tap it waits for the re-price.
	let current = $derived(
		priced !== null && pricedKey === keyOf(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
	);
	let discountCents = $derived(current ? (priced?.discountCents ?? 0) : 0);

	function colourName(code: string): string {
		return t(`product.colors.${code}` as never);
	}
</script>

<dialog
	bind:this={dialog}
	class="cart-drawer"
	aria-labelledby="cart-drawer-title"
	onclose={() => (isOpen = false)}
	onclick={(event) => {
		// A click on the backdrop lands on the dialog itself.
		if (event.target === dialog) close();
	}}
>
	<div class="panel">
		<header>
			<h2 id="cart-drawer-title">
				{t('cart.title')}
				{#if cart.count > 0}<span>({cart.count})</span>{/if}
			</h2>
			<button type="button" class="close" aria-label={t('common.close')} onclick={close}>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
			</button>
		</header>

		{#if cart.lines.length === 0}
			<div class="empty">
				<p>{t('cart.empty')}</p>
				<a href="/catalog" class="go">{t('cart.emptyAction')}</a>
			</div>
		{:else}
			<ul class="lines">
				{#each lines as line (line.variantId)}
					<li>
						<a href="/products/{line.slug}" class="thumb" tabindex="-1" aria-hidden="true">
							{#if line.image}
								<img src={resized(line.image, 200)} alt="" width="72" height="72" />
							{/if}
						</a>
						<div class="info">
							<a href="/products/{line.slug}" class="title">{line.title}</a>
							<p class="variant">{colourName(line.colour)} · {line.size}</p>
							<div class="controls">
								<QuantityStepper
									variantId={line.variantId}
									quantity={line.quantity}
									title={line.title}
								/>
								<button type="button" class="remove" onclick={() => cart.remove(line.variantId)}>
									{t('cart.remove')}
								</button>
							</div>
						</div>
						<span class="amount">
							{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
						</span>
					</li>
				{/each}
			</ul>

			<footer>
				<dl>
					<div>
						<dt>{t('cart.subtotal')}</dt>
						<dd>{formatMoney(subtotalCents, locale, currency)}</dd>
					</div>
					{#if discountCents > 0}
						<div class="saving">
							<dt>{priced?.bogoDiscountCents ? t(priced.bundlePercentOff ? 'checkout.offerDiscount' : 'checkout.bogoDiscount') : t('checkout.bundleDiscount')}{#if !priced?.bogoDiscountCents} ({priced?.bundlePercentOff}%){/if}</dt>
							<dd>−{formatMoney(discountCents, locale, currency)}</dd>
						</div>
					{/if}
				</dl>
				{#if failed}
					<p class="note" role="status">
						{t('cart.priceFailed')}
						<button type="button" class="retry" onclick={() => attempt++}>{t('cart.retry')}</button>
					</p>
				{/if}
				<a href="/checkout" class="go">{t('cart.checkout')}</a>
				<button type="button" class="keep" onclick={close}>{t('cart.emptyAction')}</button>
			</footer>
		{/if}
	</div>
</dialog>

<style>
	.cart-drawer {
		/* The dialog is the whole screen; the panel inside it is the drawer,
		   so a tap on the dimmed part lands on the dialog and closes it. */
		position: fixed;
		inset: 0;
		width: 100%;
		max-width: none;
		height: 100%;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--brand-navy, #1b1b1b);
	}
	.cart-drawer::backdrop {
		background: rgb(11 60 73 / 0.45);
	}
	.panel {
		margin-left: auto;
		display: flex;
		flex-direction: column;
		width: min(420px, 100%);
		height: 100%;
		background: #fff;
		box-shadow: -8px 0 32px rgb(0 0 0 / 0.12);
		animation: slide-in 0.22s ease-out;
	}
	@keyframes slide-in {
		from {
			transform: translateX(100%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: none;
		}
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 12px 12px 20px;
		border-bottom: 1px solid #e6e2da;
	}
	h2 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
	}
	h2 span {
		font-weight: 500;
		color: #5b6b70;
	}
	.close {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border: 0;
		border-radius: 10px;
		background: none;
		color: inherit;
		cursor: pointer;
	}
	.close:hover {
		background: #f2efe9;
	}
	.close svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
	}
	.empty {
		padding: 32px 20px;
		font-size: 16px;
		color: #5b6b70;
	}
	.empty p {
		margin: 0 0 20px;
	}
	.lines {
		flex: 1;
		overflow-y: auto;
		margin: 0;
		padding: 4px 20px;
		list-style: none;
	}
	.lines li {
		display: grid;
		grid-template-columns: 72px 1fr auto;
		gap: 14px;
		padding: 16px 0;
		border-bottom: 1px solid #efebe4;
	}
	.lines li:last-child {
		border-bottom: 0;
	}
	.thumb {
		width: 72px;
		height: 72px;
		border-radius: 10px;
		overflow: hidden;
		background: #f2efe9;
	}
	.thumb img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.info {
		min-width: 0;
	}
	.title {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.3;
	}
	.title:hover {
		text-decoration: underline;
	}
	.variant {
		margin: 2px 0 10px;
		font-size: 14px;
		color: #5b6b70;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 14px;
	}
	.remove {
		min-height: 44px;
		border: 0;
		background: none;
		color: #5b6b70;
		font-size: 14px;
		text-decoration: underline;
		cursor: pointer;
	}
	.amount {
		font-size: 15px;
		font-weight: 600;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	footer {
		padding: 16px 20px 20px;
		border-top: 1px solid #e6e2da;
	}
	dl {
		margin: 0 0 14px;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		font-size: 16px;
		font-weight: 600;
	}
	dl .saving {
		margin-top: 4px;
		font-size: 15px;
		font-weight: 500;
		color: #2f7d4f;
	}
	.note {
		margin: -4px 0 14px;
		font-size: 14px;
		line-height: 1.4;
		color: #5b6b70;
	}
	.retry {
		/* Inline padding grows the tap area without spacing out the lines. */
		margin: -10px -2px;
		padding: 10px 2px;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}
	.go {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 52px;
		border-radius: 999px;
		background: var(--brand-orange, #1b1b1b);
		color: var(--brand-navy, #fff);
		font-size: 16px;
		font-weight: 600;
	}
	.go:hover {
		filter: brightness(1.06);
	}
	.keep {
		display: block;
		width: 100%;
		min-height: 44px;
		margin-top: 6px;
		border: 0;
		background: none;
		color: inherit;
		font-size: 15px;
		text-decoration: underline;
		cursor: pointer;
	}
	.go:focus-visible,
	.keep:focus-visible,
	.remove:focus-visible,
	.close:focus-visible,
	.title:focus-visible {
		outline: 2px solid currentColor;
		outline-offset: 2px;
	}
</style>
