<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import PageLayout from '@funnel/core/PageLayout.svelte';
	import { STORE_BLOCKS } from '$lib/store/blocks';
	import { countryForm } from '@funnel/blocks-dr/subdivisions';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { FunnelStateAdapter, SubmitFn, TrackFn } from '@funnel/core';
	import { toAmount } from 'ecomwithai/marketing';
	import { track as pixel } from '$lib/analytics/pixel';
	import { amount, pushEcommerce } from '$lib/analytics/datalayer';
	import { countryOptions } from '$lib/countries';
	import { createTranslator, defaultLocale, formatMoney } from '$lib/i18n';
	import { PRODUCT_SLUG } from '$lib/store/product';
	import { SHIPPING_RATES } from '$lib/store/shipping-rates';
	import { cart } from '$lib/stores/cart.svelte';
	import CardFields from '$lib/components/CardFields.svelte';
	import QuantityStepper from '$lib/components/QuantityStepper.svelte';
	import { resized } from '$lib/resized';
	import { fieldProblem } from '$lib/checkout-fields';
	import type { ActionData, PageData } from '../../routes/checkout/$types';

	/**
	 * The checkout, shared by `/checkout` and a product's one-page checkout at
	 * `/products/<slug>/checkout`. Both post to `placeOrder`, and both run this
	 * component, so the cart pricing, the cross-form check, the card fields and
	 * the checkout events are one piece of code: the pages differ in which
	 * blocks sit above the payment section, never in what a sale is.
	 */
	let {
		data,
		form,
		bag,
		funnelState,
		track = () => {},
		initiateKey,
		initiateAfterContact = false,
		continueHref = `/products/${PRODUCT_SLUG}`,
		emptyNote,
		rowClass,
		colClass = 'flex flex-col gap-5',
		topSummary = true,
		mainClass = 'flex flex-col gap-6 py-8',
		look = 'default',
		pickerSlug,
		pickerSetsQuantity = false,
		order,
		arrival = '',
		tierField = 'bundle'
	}: {
		data: Pick<
			PageData,
			| 'definition'
			| 'version'
			| 'paymentsEnabled'
			| 'stripePublishableKey'
			| 'stripePaymentMethodConfiguration'
			| 'cancelled'
		>;
		form: ActionData;
		/** Host state the blocks write into, from `sessionFunnelState()`. */
		bag: Record<string, string>;
		funnelState: FunnelStateAdapter;
		/**
		 * Where block events go. Nothing the checkout blocks emit is one of
		 * Meta's events — what matters here, checkout started and payment
		 * details submitted, are host moments, because only the host knows the
		 * cart and the total, so they are fired below rather than forwarded from
		 * a block. Unmapped block events are dropped rather than passed through
		 * under their own names: an ad account full of
		 * `shipping_method_selected` is noise no campaign optimises against. A
		 * page with a picker on it listens here for the buyer's choices.
		 */
		track?: TrackFn;
		/**
		 * What makes two InitiateCheckouts the same one. The cart's contents by
		 * default; a page where the cart changes as the buyer picks a size
		 * passes a fixed key instead, or every size tried would be a checkout
		 * started.
		 */
		initiateKey?: string;
		/**
		 * Hold InitiateCheckout until the buyer starts on their details. On a
		 * page that is product and checkout at once, a cart exists the moment a
		 * size is picked, and that is AddToCart; filling in a name or email is
		 * starting the checkout.
		 */
		initiateAfterContact?: boolean;
		/** Where an empty cart and the confirmation send someone to shop. */
		continueHref?: string;
		/** Said instead of the empty-cart link, on a page that is its own shop. */
		emptyNote?: string;
		/** For a manifest that groups blocks into a row; the checkout's own don't. */
		rowClass?: string;
		colClass?: string;
		mainClass?: string;
		/**
		 * What is being bought, above the form. On `/checkout` the only other
		 * summary is under the card fields, so a buyer filled in everything
		 * without seeing the colour and size they chose. Off where the product
		 * is already at the top of the page.
		 */
		topSummary?: boolean;
		/**
		 * `shop` lays the same checkout out as a hosted shop checkout does:
		 * one column of sections, the summary beside it (a folding bar on a
		 * phone), errors under each field, policy links under the button. It
		 * is markup only: what is priced, checked, tracked and posted is the
		 * code above the markup, shared by both looks. Its fields are the shop
		 * blocks, which ask for first and last name separately.
		 *
		 * `classic` is the Classic Christmas checkout: one card, a pine header,
		 * the order panel (with the colour, size and quantity selects) in cream
		 * on top of a phone and beside the form on a desktop, then numbered
		 * steps. Its fields are the shop blocks too, so it checks, flags and
		 * posts exactly as the shop look does.
		 */
		look?: 'default' | 'shop' | 'classic';
		/**
		 * On a one-page checkout, the product whose picker sits above the
		 * form. Its line is the picker's to change: it gets no Remove (the
		 * picker would show a size the cart no longer holds), and when the
		 * picker's bundle cards set the count (`pickerSetsQuantity`), no
		 * quantity buttons either. Every other line in the cart can be changed
		 * or removed here.
		 */
		pickerSlug?: string;
		pickerSetsQuantity?: boolean;
		/**
		 * What the classic look's order panel offers; see the one-page loader.
		 * Its selects choose the `pickerSlug` product.
		 */
		order?: ClassicOrder | null;
		arrival?: string;
		/** The state key the product's bundle tier, its quantity, lives under. */
		tierField?: string;
	} = $props();

	type ClassicOrder = {
		title: string;
		tagline: string;
		arrival: string;
		initialDesign: string;
		designLabel: string;
		designs: { code: string; label: string; image?: string }[];
		sizes: { code: string; label: string }[];
		available: string[];
		sizeNotes: Record<string, string>;
		quantities: number[];
	};

	let shop = $derived(look === 'shop');
	let classic = $derived(look === 'classic');
	// Both of those draw their fields with the shop blocks: first and last
	// name apart, each field with its own message under it.
	let split = $derived(look !== 'default');
	let summaryOpen = $state(false);

	const canStep = (line: { slug: string }) => !(pickerSetsQuantity && line.slug === pickerSlug);
	const canRemove = (line: { slug: string }) => line.slug !== pickerSlug;
	// The cart's count, not the priced one: the price follows a moment later,
	// from /api/cart, and the number under the buyer's thumb must not lag.
	const quantityOf = (line: { variantId: number; quantity: number }) =>
		cart.lines.find((l) => l.variantId === line.variantId)?.quantity ?? line.quantity;

	/**
	 * A basket can hold more than this page's product: the cart outlives every
	 * visit, so a life jacket added in the summer is still there under a
	 * Christmas costume, and it is charged with it. On a phone the shop
	 * look's summary starts folded, which would hide exactly that, so it
	 * opens by itself, once, when the cart holds anything else.
	 */
	let summaryOpened = false;
	$effect(() => {
		if (summaryOpened || !shop || !pickerSlug || !priced) return;
		summaryOpened = true;
		if (priced.lines.some((l) => l.slug !== pickerSlug)) summaryOpen = true;
	});

	let locale = $derived(page.data.locale ?? defaultLocale);
	let t = $derived(createTranslator(locale));

	/**
	 * The forms write every keystroke into host state, so the fields need no
	 * submit action of their own — the button that posts the order reads all
	 * three at once. `shipping` arrives anyway if a manifest ever gives the
	 * address form a button; taking the payload is cheaper than the state
	 * diverging from what was submitted.
	 */
	const submit: SubmitFn = (action, _subject, payload = {}) => {
		if (action !== 'shipping' && action !== 'contact') return;
		for (const [key, value] of Object.entries(payload)) {
			if (typeof value === 'string') funnelState.set(key, value);
		}
	};

	type PricedLine = {
		variantId: number;
		slug: string;
		title: string;
		colour: string;
		size: string;
		sku: string;
		image: string | null;
		unitPriceCents: number;
		quantity: number;
	};

	type Priced = {
		lines: PricedLine[];
		subtotalCents: number;
		discountCents: number;
		bundlePercentOff: number;
		currency: string;
	};

	const EMPTY: Priced = {
		lines: [],
		subtotalCents: 0,
		discountCents: 0,
		bundlePercentOff: 0,
		currency: 'USD'
	};

	let priced = $state<Priced | null>(null);
	let submitting = $state(false);
	let showIssues = $state(false);
	// Stable per page view: a double-submitted form returns the first order
	// instead of placing a second one.
	const submissionId = crypto.randomUUID();

	$effect(() => {
		cart.hydrate();
	});

	// Set when the last re-price failed: a timeout, an error page (a 1101 is
	// HTML) or a dropped connection. The summary then says so and offers Try
	// again, where it used to wait on "Loading…" for good, or show a full cart
	// as empty. Nothing can be paid for meanwhile: the total is the server's.
	let priceFailed = $state(false);
	let priceAttempt = $state(0);
	const PRICE_TIMEOUT_MS = 10_000;

	// Re-price whenever the local cart changes. Stored prices are display-only —
	// this endpoint and the order action are the only sources of truth, and it is
	// what makes the bundle discount show the figure that gets charged.
	$effect(() => {
		if (!cart.hydrated) return;
		void priceAttempt;
		const payload = cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));

		if (payload.length === 0) {
			priced = EMPTY;
			priceFailed = false;
			return;
		}

		let cancelled = false;
		priceFailed = false;
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
				// A line the server no longer prices is a product taken off sale
				// (`scripts/retired-products.js`) still saved in this browser. It is
				// already out of the total; drop it from the cart too, or the order
				// would post it and fail as unavailable.
				const sold = new Set(data.lines.map((l: { variantId: number }) => l.variantId));
				for (const line of cart.lines) if (!sold.has(line.variantId)) cart.remove(line.variantId);
			})
			.catch(() => {
				if (cancelled) return;
				priced = null;
				priceFailed = true;
			})
			.finally(() => clearTimeout(timer));

		return () => {
			cancelled = true;
			clearTimeout(timer);
			controller.abort();
		};
	});

	const rate = (id: string) => SHIPPING_RATES.find((r) => r.id === id)?.priceCents;

	// The method block writes its own default back to state on mount, so this
	// follows whatever it chose rather than restating a default of its own.
	let method = $derived.by(() => {
		const chosen = bag.shippingMethod ?? '';
		return rate(chosen) === undefined ? 'standard' : chosen;
	});
	let shippingCents = $derived(rate(method) ?? 0);
	let subtotalCents = $derived(priced?.subtotalCents ?? 0);
	let discountCents = $derived(priced?.discountCents ?? 0);
	let bundlePercentOff = $derived(priced?.bundlePercentOff ?? 0);
	let currency = $derived(priced?.currency ?? 'USD');
	let totalCents = $derived(subtotalCents - discountCents + shippingCents);
	let isEmpty = $derived((priced?.lines.length ?? 0) === 0);

	let countries = $derived(countryOptions(locale));

	/**
	 * The country arrives as a display name — it's what the select shows and what
	 * the address provider returns. The order takes ISO codes and rejects
	 * anything else, so the translation happens here, in the host, rather than
	 * being pushed into the block as a prop.
	 */
	let countryCode = $derived.by(() => {
		const raw = (bag.country ?? '').trim();
		if (!raw) return '';
		if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
		return countries.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.code ?? '';
	});

	let linesPayload = $derived(
		JSON.stringify(cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })))
	);

	const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	/**
	 * Saves the email with the cart as soon as both exist, so a shopper who
	 * leaves before pressing pay can get the one reminder the note under the
	 * email field promises. Debounced, so it posts once they stop typing rather
	 * than per keystroke, and only when something changed. The endpoint answers
	 * the same whatever it decided, and the answer is ignored.
	 */
	let savedDraft = '';
	$effect(() => {
		const email = (bag.email ?? '').trim();
		if (!cart.hydrated || cart.lines.length === 0 || !EMAIL.test(email)) return;
		const body = JSON.stringify({
			email,
			fullName: (bag.fullName ?? '').trim(),
			lines: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }))
		});
		if (body === savedDraft) return;
		const timer = setTimeout(() => {
			savedDraft = body;
			fetch('/api/checkout/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body,
				keepalive: true
			}).catch(() => {});
		}, 1500);
		return () => clearTimeout(timer);
	});

	/**
	 * The cross-form check.
	 *
	 * Each block validates only its own fields, and none of them has a submit
	 * button — so nothing on the page knows the address is missing an email
	 * except the thing that posts the order. That check belongs next to the pay
	 * button, which is why it lives here rather than in a manifest.
	 */
	let issues = $derived.by(() => {
		const list: string[] = [];
		if (split) {
			// The shop blocks show these under each field; this list only
			// decides whether the order can be posted.
			// By ISO code: the select shows names in the page's language, and
			// "Estados Unidos" is not a name countryForm knows.
			const stateRequired = countryForm(countryCode || bag.country).stateRequired;
			for (const [field, key] of [
				['email', 'email'],
				['firstName', 'firstName'],
				['lastName', 'lastName'],
				['address', 'address'],
				['city', 'city'],
				['state', 'state'],
				['zip', 'zip']
			] as const) {
				const problem = fieldProblem(field, bag[key], { stateRequired });
				if (problem) list.push(t(problem, { label: '' }));
			}
			if (!countryCode) list.push(t('checkout.fieldErrors.country'));
			return list;
		}
		const required = (value: string | undefined, label: string) => {
			if (!(value ?? '').trim()) list.push(t('checkout.errors.fieldRequired', { field: label }));
		};

		required(bag.fullName, t('checkout.fullName'));

		const email = (bag.email ?? '').trim();
		if (!email) required('', t('checkout.email'));
		else if (!EMAIL.test(email)) list.push(t('checkout.errors.emailInvalid'));

		required(bag.address, t('checkout.address1'));
		required(bag.city, t('checkout.city'));
		required(bag.zip, t('checkout.postalCode'));
		if (!countryCode) list.push(t('checkout.errors.fieldRequired', { field: t('checkout.country') }));
		// Required-ness is per country: a UK address posts fine with no county.
		if (countryForm(bag.country).stateRequired) required(bag.state, t('checkout.province'));

		return list;
	});

	// Card fields live in this page's form. `cardApi` is handed over once Stripe
	// has mounted; null means it could not, and the submit falls through to the
	// server's hosted-page path instead of stranding the customer.
	let cardApi = $state<{
		submit: () => Promise<{ error?: { message?: string } }>;
		confirm: (i: { clientSecret: string; returnUrl: string }) => Promise<{ error?: { message?: string } }>;
	} | null>(null);
	let cardUnavailable = $state(false);
	let payError = $state<string | null>(null);

	function onCardReady(api: typeof cardApi) {
		cardApi = api;
		cardUnavailable = api === null;
	}

	/**
	 * One InitiateCheckout per checkout started, not per view of this page.
	 *
	 * The guard here used to be a plain `let`, which lives exactly as long as one
	 * component mount — while the cart it describes sits in localStorage and
	 * outlives every one of them. So a reload, a back-navigation, and the bounce
	 * back from Stripe's hosted page (`/checkout?cancelled=`) each reported a
	 * fresh checkout start on the same unchanged cart, several times over for
	 * every real one. A campaign optimising on InitiateCheckout then bids against
	 * a number that is mostly one shopper reloading.
	 *
	 * Keyed on what is in the cart and held in sessionStorage instead: re-entering
	 * this page with the same lines is the same start and stays silent, while a
	 * genuinely different cart — a second order after one completes, a bundle
	 * swapped on the product page — is a new start and fires. A new session fires
	 * again too, which is right: someone coming back tomorrow to finish is
	 * starting checkout, not continuing this one.
	 */
	const INITIATED_KEY = 'checkout-initiated';

	const cartSignature = (lines: PricedLine[]): string =>
		lines
			.map((l) => `${l.variantId}:${l.quantity}`)
			.sort()
			.join(',');

	// Private mode and a full quota both throw on these. Reporting the event twice
	// costs a duplicate; refusing to report it loses the event outright — so a
	// storage failure falls through to firing, which is the behaviour this
	// replaced.
	function alreadyInitiated(signature: string): boolean {
		try {
			return sessionStorage.getItem(INITIATED_KEY) === signature;
		} catch {
			return false;
		}
	}

	function markInitiated(signature: string): void {
		try {
			sessionStorage.setItem(INITIATED_KEY, signature);
		} catch {
			// Nothing to recover: the next mount fires again.
		}
	}

	let contactStarted = $derived(Boolean((bag.email ?? '').trim() || (bag.fullName ?? '').trim()));

	$effect(() => {
		if (!priced || priced.lines.length === 0) return;
		if (initiateAfterContact && !contactStarted) return;
		const signature = initiateKey ?? cartSignature(priced.lines);
		if (alreadyInitiated(signature)) return;
		// Marked before firing, so an effect that re-runs on the same cart while
		// these calls are in flight cannot get past the check above.
		markInitiated(signature);
		pixel('InitiateCheckout', {
			content_type: 'product',
			content_ids: priced.lines.map((l) => l.sku),
			num_items: priced.lines.reduce((sum, l) => sum + l.quantity, 0),
			currency: priced.currency,
			value: toAmount(priced.subtotalCents)
		});
		pushEcommerce('begin_checkout', {
			currency: priced.currency,
			value: amount(priced.subtotalCents),
			items: priced.lines.map((l) => ({
				item_id: l.sku,
				item_name: l.title,
				item_variant: variantName(l.colour, l.size),
				price: amount(l.unitPriceCents),
				quantity: l.quantity
			}))
		});
	});

	// The action hands back an intent for the fields already on screen.
	$effect(() => {
		const pay =
			form && 'pay' in form
				? (form.pay as { clientSecret: string; returnUrl: string } | undefined)
				: undefined;
		if (!pay || !cardApi) return;
		let done = false;
		(async () => {
			if (done) return;
			done = true;
			const result = await cardApi!.confirm(pay);
			if (result.error) {
				payError = result.error.message ?? t('checkout.errors.generic');
				submitting = false;
				return;
			}
			cart.clear();
			window.location.href = pay.returnUrl;
		})();
	});

	// Only reachable with no payment provider configured — with Stripe on, the
	// order is confirmed on /checkout/success instead. Carries the server's event
	// id so Meta dedupes it against the Conversions API copy of the same sale.
	let purchaseTracked = false;
	$effect(() => {
		if (purchaseTracked || !form || !('success' in form) || !form.success) return;
		purchaseTracked = true;
		pixel(
			'Purchase',
			{
				content_type: 'product',
				content_ids: form.order.items.map((i) => i.sku),
				contents: form.order.items.map((i) => ({
					id: i.sku,
					quantity: i.quantity,
					item_price: i.unitPriceCents / 100
				})),
				num_items: form.order.items.reduce((sum, i) => sum + i.quantity, 0),
				currency: form.order.currency,
				value: toAmount(form.order.totalCents)
			},
			form.eventId
		);
		pushEcommerce('purchase', {
			transaction_id: form.order.orderNumber,
			currency: form.order.currency,
			value: amount(form.order.totalCents),
			items: form.order.items.map((i) => ({
				item_id: i.sku,
				item_name: i.title,
				price: amount(i.unitPriceCents),
				quantity: i.quantity
			}))
		});
		cart.clear();
	});

	/**
	 * What the server rejected, in the same list as what the page caught.
	 *
	 * The action validates again — it has to, since a form post is not the only
	 * way to reach it — and its verdict can differ from this page's: a country
	 * that isn't an ISO code, a field the blocks never asked for. Without this
	 * the button would post, come back rejected, and change nothing on screen,
	 * which reads as a checkout that is simply broken.
	 */
	const FIELD_LABELS: Record<string, string> = {
		fullName: 'checkout.fullName',
		firstName: 'checkout.firstName',
		lastName: 'checkout.lastName',
		email: 'checkout.email',
		address1: 'checkout.address1',
		city: 'checkout.city',
		postalCode: 'checkout.postalCode',
		country: 'checkout.country'
	};

	let serverIssues = $derived.by(() => {
		if (!form || !('fieldErrors' in form) || !form.fieldErrors) return [];
		return Object.entries(form.fieldErrors as Record<string, string | undefined>).flatMap(
			([field, code]) => {
				// The empty cart has its own message above; it isn't a field.
				if (!code || field === 'cart') return [];
				if (code === 'emailInvalid') return [t('checkout.errors.emailInvalid')];
				const label = FIELD_LABELS[field];
				return [t('checkout.errors.fieldRequired', { field: label ? t(label as never) : field })];
			}
		);
	});

	let shownIssues = $derived([...(showIssues ? issues : []), ...serverIssues]);

	let topLevelError = $derived.by(() => {
		if (!form) return null;
		if ('errorCode' in form && form.errorCode) {
			const code = form.errorCode;
			if (code === 'variant_unavailable') {
				return t('checkout.errors.variantUnavailable', { item: form.detail ?? '' });
			}
			if (code === 'payment_unavailable') return t('checkout.errors.paymentUnavailable');
			return t('checkout.errors.generic');
		}
		if ('fieldErrors' in form && form.fieldErrors?.cart) return t('checkout.errors.cartEmpty');
		return null;
	});

	function colourName(code: string): string {
		return t(`product.colors.${code}` as never);
	}

	/**
	 * GA4's `item_variant`, from the option codes rather than their translated
	 * names: "green / M" reads the same in every locale, so a report split
	 * by variant doesn't also split by language.
	 */
	function variantName(colour: string, size: string): string {
		return [colour, size].filter(Boolean).join(' / ');
	}

	/**
	 * What pressing pay does, for both looks. The blocks each validate their
	 * own fields and none of them has a button, so this is the only place the
	 * whole form is checked.
	 */
	const submitOrder: SubmitFunction = async ({ cancel }) => {
		showIssues = true;
		if (issues.length > 0) {
			cancel();
			if (split) flagFields();
			return;
		}
		submitting = true;
		payError = null;
		// Stripe's submit before anything is posted, while this is still the
		// buyer's tap: with Apple Pay chosen it opens the payment sheet, which
		// Safari refuses once the tap has passed (CardFields.svelte). It also
		// checks the card fields, so an incomplete card posts no order.
		if (cardApi) {
			const checked = await cardApi.submit();
			if (checked.error) {
				cancel();
				payError = checked.error.message ?? t('checkout.errors.generic');
				submitting = false;
				return;
			}
		}
		pixel('AddPaymentInfo', {
			content_type: 'product',
			content_ids: priced?.lines.map((l) => l.sku) ?? [],
			currency,
			value: toAmount(totalCents)
		});
		pushEcommerce('add_payment_info', {
			currency,
			value: amount(totalCents),
			items: (priced?.lines ?? []).map((l) => ({
				item_id: l.sku,
				item_name: l.title,
				item_variant: variantName(l.colour, l.size),
				price: amount(l.unitPriceCents),
				quantity: l.quantity
			}))
		});
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	};

	/**
	 * The shop look shows errors under the fields themselves, so pay with
	 * something missing tells every field block to show its message (a new
	 * token in state) and takes the buyer to the first one. On a phone that
	 * field is a screen or two above the button they pressed.
	 */
	async function flagFields() {
		funnelState.set('checkout_attempt', crypto.randomUUID());
		await tick();
		const first = document.querySelector<HTMLElement>(
			'.shop [aria-invalid="true"], .classic [aria-invalid="true"]'
		);
		if (!first) return;
		const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		first.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
		first.focus({ preventScroll: true });
	}

	let itemCount = $derived((priced?.lines ?? []).reduce((sum, l) => sum + l.quantity, 0));
	let firstImage = $derived(priced?.lines.find((l) => l.image)?.image ?? null);

	/**
	 * The classic look's order panel chooses through funnel state, under the
	 * same keys the product page's picker writes (`design`, `size`, the
	 * tier), so the page that renders this keeps the cart equal to it exactly
	 * as it does for the picker, and the server prices it. Quantity is the
	 * bundle tier, `qty-N`: the breaks the product page's cards offer.
	 */
	let chosenDesign = $derived(bag.design || order?.designs[0]?.code || '');
	let chosenSize = $derived(order?.sizes.length === 1 ? order.sizes[0].code : bag.size ?? '');
	let orderEditing = $state(false);
	let classicMounted = $state(false);
	onMount(() => { classicMounted = true; });
	let orderDesignSelect: HTMLSelectElement | undefined = $state();
	let selectionReady = $derived(Boolean(chosenSize && order?.available.includes(`${chosenDesign}:${chosenSize}`)));
	let orderExpanded = $derived(orderEditing || !selectionReady);
	async function toggleOrder() {
		orderEditing = !orderExpanded;
		if (orderEditing) {
			await tick();
			orderDesignSelect?.focus();
		}
	}
	let chosenUnits = $derived(Number(/^qty-(\d+)$/.exec(bag[tierField] ?? '')?.[1] ?? 1));
	let designImage = $derived(
		order?.designs.find((d) => d.code === chosenDesign)?.image ?? order?.designs[0]?.image ?? null
	);
	// Restore the saved photo after hydration, as a normal attribute update.
	// Svelte otherwise keeps the server's default src when session state differs.
	let classicImage = $derived(classicMounted ? designImage : order?.designs.find((d) => d.code === order.initialDesign)?.image ?? order?.designs[0]?.image);
	let otherLines = $derived((priced?.lines ?? []).filter((l) => l.slug !== pickerSlug));
	// What the selects' own product costs as chosen, shown beside it, so the
	// lines in the panel add up to the subtotal under them.
	let ownCents = $derived(
		(priced?.lines ?? [])
			.filter((l) => l.slug === pickerSlug)
			.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0)
	);
	const ORDER_SUBJECT = { id: 'order', component: 'classic_order' };

	function chooseDesign(code: string) {
		funnelState.set('design', code);
		// A size this colour doesn't come in is not a size anyone can buy.
		if (chosenSize && !order?.available.includes(`${code}:${chosenSize}`)) funnelState.set('size', '');
		track('design_selected', ORDER_SUBJECT, { design: code });
	}
	function chooseSize(code: string) {
		// Keep the editor open while someone finishes changing their choices.
		orderEditing = true;
		funnelState.set('size', code);
		track('size_selected', ORDER_SUBJECT, { size: code });
	}
	function chooseUnits(units: string) {
		funnelState.set(tierField, `qty-${units}`);
		track('bundle_selected', ORDER_SUBJECT, { bundle: `qty-${units}` });
	}

	/**
	 * Stripe's fields in the classic look's colours. The sizes are the shop
	 * look's, which is what `.classic-pay-box` reserves the height of (in
	 * classic-checkout.css): change a size or spacing and measure again.
	 */
	function replayDelivery(event: MouseEvent) {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const truck = event.currentTarget as HTMLButtonElement;
		// Replay the existing CSS journey without remounting the focused button.
		for (const target of [truck, truck.parentElement?.querySelector('.stripe')]) {
			for (const animation of target?.getAnimations() ?? []) {
				if (['classic-drive', 'classic-fill'].includes((animation as CSSAnimation).animationName)) {
					animation.currentTime = 0;
					animation.play();
				}
			}
		}
	}

	const CLASSIC_APPEARANCE = {
		theme: 'stripe',
		variables: {
			colorPrimary: '#234b35',
			colorText: '#244533',
			colorTextSecondary: '#627064',
			colorDanger: '#a12d39',
			colorBackground: '#fffefa',
			fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
			fontSizeBase: '16px',
			borderRadius: '10px'
		},
		rules: {
			'.Label': { fontSize: '16px' },
			'.Input': { fontSize: '17px' },
			'.Error': { fontSize: '16px' }
		}
	};

	/**
	 * Stripe's fields in the shop look's type and colours, so the card box
	 * reads as part of the page. Labels and inputs at 16px or more, as
	 * everywhere else on it. Changing sizes or spacing here changes the
	 * element's height, and `.shop-pay-box` reserves that height (in
	 * shop-checkout.css) so nothing below it moves while it loads: measure
	 * again and update both together.
	 */
	const SHOP_APPEARANCE = {
		theme: 'stripe',
		variables: {
			colorPrimary: '#173d2b',
			colorText: '#111111',
			colorTextSecondary: '#555555',
			colorDanger: '#b00020',
			fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
			fontSizeBase: '16px',
			borderRadius: '10px'
		},
		rules: {
			'.Label': { fontSize: '16px' },
			'.Input': { fontSize: '17px' },
			'.Error': { fontSize: '16px' }
		}
	};
	const SHOP_FONTS = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap' }];
</script>

<!-- What the blocks wrote into host state, in the names the order takes.
     The mapping lives here because the block's job ends at "these are
     the fields"; what an address is called downstream is the host's. -->
{#snippet lineControls(line: PricedLine, withChange: boolean)}
	{#if canStep(line) || canRemove(line) || withChange}
		<div
			class={split
				? 'line-actions'
				: 'text-15 text-fx-sub mt-1 flex flex-wrap items-center gap-x-4 gap-y-1'}
		>
			{#if canStep(line)}
				<QuantityStepper variantId={line.variantId} quantity={quantityOf(line)} title={line.title} />
			{/if}
			{#if canRemove(line)}
				<button
					type="button"
					onclick={() => cart.remove(line.variantId)}
					class={split ? 'line-link' : 'min-h-11 underline'}
				>
					{t('cart.remove')}
				</button>
			{/if}
			{#if withChange}
				<a href="/products/{line.slug}" class={split ? 'line-link' : 'inline-flex min-h-11 items-center underline'}>
					{t('checkout.changeOrder')}
				</a>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet hiddenFields()}
	<!-- The shop look asks for the two names separately, and posts them
	     that way, so "Mary Ann" stays a first name instead of being split
	     at its first space. -->
	{#if split}
		<input type="hidden" name="firstName" value={bag.firstName ?? ''} />
		<input type="hidden" name="lastName" value={bag.lastName ?? ''} />
	{:else}
		<input type="hidden" name="fullName" value={bag.fullName ?? ''} />
	{/if}
	<input type="hidden" name="email" value={bag.email ?? ''} />
	<input type="hidden" name="phone" value={bag.phone ?? ''} />
	<input type="hidden" name="address1" value={bag.address ?? ''} />
	<input type="hidden" name="address2" value={bag.address2 ?? ''} />
	<input type="hidden" name="city" value={bag.city ?? ''} />
	<input type="hidden" name="province" value={bag.state ?? ''} />
	<input type="hidden" name="postalCode" value={bag.zip ?? ''} />
	<input type="hidden" name="country" value={countryCode} />
	<input type="hidden" name="method" value={method} />
	<input type="hidden" name="lines" value={linesPayload} />
	<!-- Tells the server whether the card fields are actually usable. If
	     Stripe.js was blocked, there is nothing on this page to confirm
	     against, so the order has to go via the hosted page instead. -->
	<input type="hidden" name="cardReady" value={cardApi ? '1' : '0'} />
	<input type="hidden" name="submissionId" value={submissionId} />
{/snippet}

{#snippet alerts()}
	{#if topLevelError}
		<p
			class="rounded-field text-15 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
			class:shop-alert={split}
			role="alert"
		>
			{topLevelError}
		</p>
	{:else if data.cancelled}
		<!-- Backing out of Stripe is not an error, and saying "nothing was
		     charged" up front stops the second attempt people make when they
		     aren't sure. -->
		<p
			class="rounded-field text-15 text-fx-sub border border-[#d8d5cf] bg-white px-4 py-3"
			class:shop-notice={split}
		>
			{t('checkout.cancelled')}
		</p>
	{/if}

	{#if payError}
		<p
			class="rounded-field text-15 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
			class:shop-alert={split}
			role="alert"
		>
			{payError}
		</p>
	{/if}

	{#if split}
		<!-- The fields carry their own messages; this line is for whoever is
		     looking at the button they just pressed. The server's verdict
		     still lists itself, since it can name a field the page didn't ask. -->
		{#if (showIssues && issues.length > 0) || serverIssues.length > 0}
			<div class="shop-alert" role="alert">
				{#if showIssues && issues.length > 0}<p>{t('checkout.shop.fixFields')}</p>{/if}
				{#if serverIssues.length > 0}
					<ul>
						{#each serverIssues as issue (issue)}<li>{issue}</li>{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{:else if shownIssues.length > 0}
		<ul
			class="rounded-field text-15 flex flex-col gap-1 border border-[#c8342f] bg-[#fdf3f2] px-4 py-3 text-[#c8342f]"
			role="alert"
		>
			{#each shownIssues as issue (issue)}
				<li>{issue}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet payButton()}
	<button
		type="submit"
		disabled={submitting || isEmpty}
		class={shop
			? 'shop-pay'
			: 'rounded-field bg-fx-ink text-17 w-full px-4 py-4 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'}
	>
		{#if submitting}
			{t('checkout.placing')}
		{:else if totalCents > 0}
			{t('checkout.payNow', { total: formatMoney(totalCents, locale, currency) })}
		{:else}
			{t('checkout.placeOrder')}
		{/if}
	</button>
{/snippet}

{#snippet priceRetry()}
	<p class="text-15 text-fx-sub" role="alert">
		{t('cart.loadFailed')}
		<button type="button" class="underline" onclick={() => priceAttempt++}>{t('cart.retry')}</button>
	</p>
{/snippet}

{#snippet shopSummary()}
	{#if priced === null && priceFailed}
		{@render priceRetry()}
	{:else if priced === null}
		<p class="shop-muted">{t('common.loading')}</p>
	{:else if isEmpty}
		<p class="shop-muted">{t('checkout.shop.pick')}</p>
	{:else}
		<ul class="shop-lines">
			{#each priced.lines as line (line.variantId)}
				<li>
					<span class="thumb">
						{#if line.image}
							<img src={resized(line.image, 200)} alt="" width="64" height="64" />
						{/if}
						<b class="qty" aria-label="{t('cart.quantity')} {line.quantity}">{line.quantity}</b>
					</span>
					<span class="name">
						{line.title}
						<small>{colourName(line.colour)} · {line.size}</small>
						{@render lineControls(line, false)}
					</span>
					<span class="amount">
						{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
					</span>
				</li>
			{/each}
		</ul>
		<dl class="shop-totals">
			<div>
				<dt>{t('checkout.subtotal')}</dt>
				<dd>{formatMoney(subtotalCents, locale, currency)}</dd>
			</div>
			{#if discountCents > 0}
				<div class="saving">
					<dt>{t('checkout.bundleDiscount')} ({bundlePercentOff}%)</dt>
					<dd>−{formatMoney(discountCents, locale, currency)}</dd>
				</div>
			{/if}
			<div>
				<dt>{t('checkout.shipping')}</dt>
				<dd>{shippingCents === 0 ? t('checkout.free') : formatMoney(shippingCents, locale, currency)}</dd>
			</div>
			<div class="total">
				<dt>{t('checkout.total')}</dt>
				<dd><small>{currency}</small> {formatMoney(totalCents, locale, currency)}</dd>
			</div>
		</dl>
	{/if}
{/snippet}

{#if form && 'success' in form && form.success}
	<div class="storefront-type tree-checkout bg-fx-bg min-h-svh pb-12" class:shop-type={shop}>
		<section class="max-w-page px-gutter mx-auto flex flex-col gap-4 py-16 text-center">
			<h1 class="text-33 tracking-display text-fx-ink font-bold">{t('checkout.successTitle')}</h1>
			<p class="text-17 text-fx-sub">
				{t('checkout.successBody', { orderNumber: form.order.orderNumber, email: form.email })}
			</p>
			<p class="text-17 text-fx-ink font-semibold">
				{t('checkout.total')}: {formatMoney(form.order.totalCents, locale, form.order.currency)}
			</p>
			<a
				href={continueHref}
				class="rounded-field bg-fx-ink text-15 mx-auto mt-4 px-6 py-3 font-medium text-white"
			>
				{t('checkout.successContinue')}
			</a>
		</section>
	</div>
{:else if classic}
	<div class="classic">
		<div class="classic-card">
			<header class="classic-head">
				<!-- The owner's logo, white on the pine (static/brand). -->
				<a href="/" class="classic-logo">
					<img src="/brand/logo-white.png" alt={t('common.brand')} width="449" height="96" />
				</a>
				<span class="classic-secure">
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
						<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
						<circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
					</svg>
					{t('checkout.shop.secure')}
				</span>
			</header>
			<h1 class="sr-only">{t('checkout.title')}</h1>

			<div class="classic-grid">
				<!-- The order first in the source: on a phone it is the top of the
				     page; on a desktop the grid moves it beside the form. -->
				<aside class="classic-order" aria-label={t('checkout.yourOrder')}>
					<div class="classic-order-inner">
						<div class="classic-free">
							<p class="lead">
								{t('checkout.classic.freeLead')} <strong>{t('checkout.classic.freeStrong')}</strong>
							</p>
							<p class="note">{t('checkout.classic.freeNote')}</p>
							<!-- The stripe fills and the truck drives to the end of it;
							     both stand still under prefers-reduced-motion. -->
							<p class="classic-truck-hint">{t('checkout.classic.truckHint')}</p>
							<div class="classic-road">
								<span class="stripe" aria-hidden="true"></span>
								<button type="button" class="truck" aria-label={t('checkout.classic.truckReplay')} title={t('checkout.classic.truckReplay')} onclick={replayDelivery}>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path
											d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.2v2.8h-7"
											fill="none"
											stroke="currentColor"
											stroke-width="1.7"
											stroke-linejoin="round"
										/>
										<circle class="wheel" cx="6.5" cy="17" r="1.9" fill="#fffefa" stroke="currentColor" stroke-width="1.7" />
										<circle class="wheel" cx="17" cy="17" r="1.9" fill="#fffefa" stroke="currentColor" stroke-width="1.7" />
									</svg>
								</button>
							</div>
						</div>

						<div class="classic-order-head">
							<h2>{t('checkout.yourOrder')}</h2>
							{#if priced && !isEmpty}
								<span>
									{itemCount === 1
										? t('checkout.shop.oneItem')
										: t('checkout.shop.manyItems', { count: itemCount })}
								</span>
							{/if}
						</div>

						{#if order}
							<div class="classic-product">
								{#if classicImage}
									<img src={resized(classicImage, 200)} alt="" width="84" height="84" />
								{/if}
								<div>
									<p class="name">{order.title}</p>
									{#if order.tagline}<p class="tagline">{order.tagline}</p>{/if}
								</div>
								{#if ownCents > 0}
									<b class="amount">{formatMoney(ownCents, locale, currency)}</b>
								{/if}
							</div>
							<div class="classic-selection">
								<p>
									{order.designs.find((design) => design.code === chosenDesign)?.label ?? chosenDesign}
									{#if order.sizes.length > 1}· {t('checkout.classic.size')} {chosenSize || '—'}{/if} · {t('checkout.classic.qty')} {chosenUnits}
								</p>
								<button type="button" aria-expanded={orderExpanded} aria-controls="classic-order-options" disabled={!selectionReady} onclick={toggleOrder}>
									{t(orderExpanded ? 'checkout.classic.done' : 'checkout.classic.change')}
								</button>
							</div>
							<div id="classic-order-options" class="classic-options" class:collapsed={!orderExpanded}>
								<div class="classic-picks" class:one-size={order.sizes.length === 1}>
									<label class="pick">
										<span>{order.designLabel}</span>
										<select
											id="order-design"
											bind:this={orderDesignSelect}
											value={chosenDesign}
											onchange={(e) => chooseDesign(e.currentTarget.value)}
										>
											{#each order.designs as design (design.code)}
												<option value={design.code}>{design.label}</option>
											{/each}
										</select>
									</label>
									{#if order.sizes.length > 1}
										<label class="pick">
											<span>{t('checkout.classic.size')}</span>
											<select
												id="order-size"
												value={chosenSize}
												onchange={(e) => chooseSize(e.currentTarget.value)}
											>
												{#if !chosenSize}
													<option value="" disabled>{t('checkout.classic.chooseSize')}</option>
												{/if}
												{#each order.sizes as size (size.code)}
													<option
														value={size.code}
														disabled={!order.available.includes(`${chosenDesign}:${size.code}`)}
													>
														{size.label}
													</option>
												{/each}
											</select>
										</label>
									{/if}
									<label class="pick qty">
										<span>{t('checkout.classic.qty')}</span>
										<select
											id="order-qty"
											value={String(chosenUnits)}
											onchange={(e) => chooseUnits(e.currentTarget.value)}
										>
											{#each order.quantities as units (units)}
												<option value={String(units)}>{units}</option>
											{/each}
										</select>
									</label>
								</div>
								{#if order.sizes.length > 1}
									<p class="classic-size-note">
										{#if chosenSize && order.sizeNotes[chosenSize]}
											{order.sizeNotes[chosenSize]}. {t('checkout.classic.sizeTip')}
										{:else if !chosenSize}
											{t('checkout.classic.pick')}
										{:else}
											{t('checkout.classic.sizeTip')}
										{/if}
									</p>
								{/if}
							</div>
						{/if}

						{#each otherLines as line (line.variantId)}
							<div class="classic-line">
								{#if line.image}<img src={resized(line.image, 200)} alt="" width="48" height="48" />{/if}
								<div>
									<p>
										{line.title}
										<small>{colourName(line.colour)} · {line.size}</small>
									</p>
									{@render lineControls(line, !pickerSlug)}
								</div>
								<b>{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}</b>
							</div>
						{/each}

						{#if priced && isEmpty && !order}
							<p>{t('cart.empty')} <a class="line-link" href={continueHref}>{t('cart.emptyAction')}</a></p>
						{/if}
						{#if priced === null && priceFailed}{@render priceRetry()}{/if}
						<dl class="classic-totals">
							<div>
								<dt>{t('checkout.subtotal')}</dt>
								<dd>{formatMoney(subtotalCents, locale, currency)}</dd>
							</div>
							{#if discountCents > 0}
								<div class="saving">
									<dt>{t('checkout.bundleDiscount')} ({bundlePercentOff}%)</dt>
									<dd>−{formatMoney(discountCents, locale, currency)}</dd>
								</div>
							{/if}
							<div>
								<dt>{t('checkout.shipping')}</dt>
								<dd>
									{shippingCents === 0
										? t('checkout.free').toUpperCase()
										: formatMoney(shippingCents, locale, currency)}
								</dd>
							</div>
							<div class="total">
								<dt>{t('checkout.total')} <small>{currency}</small></dt>
								<dd>{formatMoney(totalCents, locale, currency)}</dd>
							</div>
						</dl>
						{#if order?.arrival || arrival}<p class="classic-arrival">{order?.arrival || arrival}</p>{/if}

						<section class="classic-peace" aria-labelledby="classic-peace-title">
							<p class="kicker">{t('checkout.classic.peaceKicker')}</p>
							<h2 id="classic-peace-title">{t('checkout.classic.peaceTitle')}</h2>
							{#if order && order.sizes.length > 1}
							<details>
								<summary>{t('checkout.classic.fitQ')}</summary>
								<p>
									{chosenSize
										? t('checkout.classic.fitSelected', { size: chosenSize })
										: t('checkout.classic.fitNone')}
									{t('checkout.classic.fitBody')}
								</p>
								<!-- The bands themselves, here, rather than a link out of
								     the checkout to the product page's guide. -->
								{#if order && Object.keys(order.sizeNotes).length > 0}
									<ul class="bands">
										{#each order.sizes as size (size.code)}
											{#if order.sizeNotes[size.code]}
												<li class:current={size.code === chosenSize}>{order.sizeNotes[size.code]}</li>
											{/if}
										{/each}
									</ul>
								{/if}
							</details>
							{/if}
							<details>
								<summary>{t('checkout.classic.arriveQ')}</summary>
								<p>{t('checkout.classic.arriveA')}</p>
							</details>
							<details>
								<summary>{t('checkout.classic.returnQ')}</summary>
								<p>{t('checkout.classic.returnA')}</p>
							</details>
						</section>
					</div>
				</aside>

				<div class="classic-main">
					<div class="classic-intro">
						<p class="kicker">{t('checkout.classic.kicker')}</p>
						<p class="headline">
							{t('checkout.classic.headline1')}<br />{t('checkout.classic.headline2')}
						</p>
						<p class="sub">{t('checkout.classic.sub')}</p>
					</div>

					<PageLayout
						definition={data.definition}
						version={data.version}
						components={STORE_BLOCKS}
						{track}
						{submit}
						state={funnelState}
						mainClass="classic-blocks"
						rowClass=""
						colClass=""
					/>

					<form method="POST" class="classic-form" use:enhance={submitOrder}>
						{@render hiddenFields()}

						<section class="shop-section" aria-labelledby="classic-payment-title">
							<h2 id="classic-payment-title" class="step">
								<span class="step-no" aria-hidden="true">4</span>
								{t('checkout.classic.paymentTitle')}
							</h2>
							{#if data.paymentsEnabled && data.stripePublishableKey && !cardUnavailable}
								<div class="classic-pay">
									<p class="classic-pay-head">
										<span>
											<svg viewBox="0 0 24 24" aria-hidden="true">
												<rect x="2.5" y="5.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7" />
												<path d="M2.5 9.5h19" stroke="currentColor" stroke-width="1.7" />
											</svg>
											{t('checkout.classic.card')}
										</span>
										<small>{t('checkout.classic.brands')}</small>
									</p>
									<!-- Holds the height the card fields will take, so the button
									     and everything under it stay put while Stripe.js loads. -->
									<div class="classic-pay-box" class:ready={Boolean(cardApi)}>
										{#if !cardApi}
											<p class="classic-pay-loading">{t('checkout.paymentLoading')}</p>
										{/if}
										<CardFields
											publishableKey={data.stripePublishableKey}
											paymentMethodConfiguration={data.stripePaymentMethodConfiguration}
											amountCents={totalCents}
											{currency}
											appearance={CLASSIC_APPEARANCE}
											fonts={SHOP_FONTS}
											onready={onCardReady}
										/>
									</div>
									<p class="classic-lock">
										<svg viewBox="0 0 24 24" aria-hidden="true">
											<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
											<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.8" />
										</svg>
										{t('checkout.classic.encrypted')}
									</p>
								</div>
							{:else}
								<p class="shop-notice">
									{data.paymentsEnabled ? t('checkout.paymentHostedNote') : t('checkout.paymentPending')}
								</p>
							{/if}
						</section>

						<!-- Always drawn: the cart is priced in the browser, and a row
						     that appeared once it was would move the button. -->
						<p class="classic-due">
							<span>{t('checkout.total')} · {currency}</span>
							<b>{priced && !isEmpty ? formatMoney(totalCents, locale, currency) : ''}</b>
						</p>

						{@render alerts()}

						<button type="submit" class="classic-payb" disabled={submitting || isEmpty}>
							<svg viewBox="0 0 24 24" aria-hidden="true">
								<rect x="5" y="10.5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
								<path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
							<span>
								{#if submitting}
									{t('checkout.placing')}
								{:else if totalCents > 0}
									{t('checkout.payNow', { total: formatMoney(totalCents, locale, currency) })}
								{:else}
									{t('checkout.placeOrder')}
								{/if}
							</span>
							<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true">
								<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" />
							</svg>
						</button>
						<p class="classic-once">{t('checkout.classic.oneTime', { currency })}</p>

						<nav class="classic-links" aria-label={t('checkout.shop.secure')}>
							<a href="/policies/refunds">{t('checkout.classic.returns')}</a>
							<a href="/policies/shipping">{t('checkout.classic.shippingLink')}</a>
							<a href="/contact">{t('checkout.classic.contact')}</a>
							<span>
								<a href="/privacy">{t('checkout.classic.privacy')}</a> ·
								<a href="/terms">{t('checkout.classic.terms')}</a>
							</span>
						</nav>
					</form>
				</div>
			</div>
		</div>
	</div>
{:else if shop}
	<div class="shop">
		<h1 class="sr-only">{t('checkout.title')}</h1>

		<!-- On a phone the summary is a bar under the header that opens in
		     place: the total is always in sight, the lines are one tap away,
		     and the form starts on the first screen. -->
		<div class="shop-bar">
			<button
				type="button"
				aria-expanded={summaryOpen}
				aria-controls="shop-summary-folded"
				onclick={() => (summaryOpen = !summaryOpen)}
			>
				<span>{summaryOpen ? t('checkout.shop.hideSummary') : t('checkout.shop.showSummary')}</span>
				<svg class:open={summaryOpen} viewBox="0 0 16 16" aria-hidden="true">
					<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" />
				</svg>
			</button>
			{#if !isEmpty}
				<strong>{formatMoney(totalCents, locale, currency)}</strong>
			{/if}
		</div>
		{#if summaryOpen}
			<div class="shop-folded" id="shop-summary-folded">{@render shopSummary()}</div>
		{/if}

		<div class="shop-grid">
			<div class="shop-main">
				<PageLayout
					definition={data.definition}
					version={data.version}
					components={STORE_BLOCKS}
					{track}
					{submit}
					state={funnelState}
					mainClass="shop-blocks"
					rowClass=""
					colClass=""
				/>

				<form method="POST" class="shop-form" use:enhance={submitOrder}>
					{@render hiddenFields()}

					<section class="shop-section" aria-labelledby="shop-payment-title">
						<h2 id="shop-payment-title">{t('checkout.paymentTitle')}</h2>
						{#if data.paymentsEnabled && data.stripePublishableKey && !cardUnavailable}
							<p class="shop-sub">{t('checkout.shop.paymentNote')}</p>
							<!-- Holds the height the card fields will take, so the button
							     and everything under it stay put while Stripe.js loads. -->
							<div class="shop-pay-box" class:ready={Boolean(cardApi)}>
								{#if isEmpty && priced !== null}
									<p class="shop-pay-loading">{t('checkout.paymentEmpty')}</p>
								{:else if !cardApi}
									<p class="shop-pay-loading">{t('checkout.paymentLoading')}</p>
								{/if}
								<CardFields
									publishableKey={data.stripePublishableKey}
									paymentMethodConfiguration={data.stripePaymentMethodConfiguration}
									amountCents={totalCents}
									{currency}
									appearance={SHOP_APPEARANCE}
									fonts={SHOP_FONTS}
									onready={onCardReady}
								/>
							</div>
						{:else}
							<p class="shop-notice">
								{data.paymentsEnabled ? t('checkout.paymentHostedNote') : t('checkout.paymentPending')}
							</p>
						{/if}
					</section>

					<!-- The total once more, by the button, as the reference does on a
					     phone: the summary bar is a long way up by now. -->
					<!-- Always drawn, empty until /api/cart has priced the cart: the
					     cart only exists in the browser, so a row that appeared once
					     it was priced dropped the button by its own height a moment
					     after the page did. -->
					<div class="shop-due">
						{#if firstImage}<img src={resized(firstImage, 200)} alt="" width="44" height="44" />{/if}
						<p>
							<strong>{t('checkout.total')}</strong>
							{#if priced && !isEmpty}
								<span>
									{itemCount === 1
										? t('checkout.shop.oneItem')
										: t('checkout.shop.manyItems', { count: itemCount })}
								</span>
							{/if}
						</p>
						{#if priced && !isEmpty}
							<b><small>{currency}</small> {formatMoney(totalCents, locale, currency)}</b>
						{/if}
					</div>

					{@render alerts()}
					{@render payButton()}

					<nav class="shop-policies" aria-label={t('checkout.shop.secure')}>
						<a href="/policies/refunds">{t('footer.refunds')}</a>
						<a href="/policies/shipping">{t('footer.shipping')}</a>
						<a href="/privacy">{t('footer.privacy')}</a>
						<a href="/terms">{t('footer.terms')}</a>
						<a href="/contact">{t('footer.contact')}</a>
					</nav>
				</form>
			</div>

			<aside class="shop-aside" aria-label={t('checkout.summaryTitle')}>
				<div class="shop-aside-inner">{@render shopSummary()}</div>
			</aside>
		</div>
	</div>
{:else}
	<div class="storefront-type tree-checkout bg-fx-bg min-h-svh pb-12">
		<!-- Contact, address and shipping method are blocks; everything below them
		     is host chrome. Payment deliberately is not a block: unknown block
		     types are skipped by design, which on a checkout would render a page
		     that looks complete and silently cannot take money. -->
		{#if topSummary && priced && priced.lines.length > 0}
			<section class="max-w-page px-gutter mx-auto w-full pt-6" aria-label={t('checkout.yourOrder')}>
				<div class="rounded-field flex flex-col gap-3 border border-[#d8d5cf] bg-white p-3">
					{#each priced.lines as line (line.variantId)}
						<div class="flex items-start gap-3">
							{#if line.image}
								<img
									src={resized(line.image, 200)}
									alt=""
									width="56"
									height="56"
									class="size-14 shrink-0 rounded-lg object-cover"
								/>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="text-15 text-fx-ink truncate font-medium">{line.title}</p>
								<p class="text-13 text-fx-muted">
									{colourName(line.colour)} · {line.size}{#if !canStep(line)}
										· {t('cart.quantity')} {line.quantity}{/if}
								</p>
								<!-- Each line its own controls and its own way back: one
								     "Change" for the whole box took the buyer to whichever
								     product happened to be first. -->
								{@render lineControls(line, true)}
							</div>
							<span class="text-15 text-fx-ink self-start font-semibold whitespace-nowrap tabular-nums">
								{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
							</span>
						</div>
					{/each}
					<div class="text-15 flex items-center justify-end border-t border-[#e2e0dc] pt-2">
						<span class="text-fx-ink font-semibold tabular-nums">
							{t('checkout.total')}: {formatMoney(totalCents, locale, currency)}
						</span>
					</div>
				</div>
			</section>
		{/if}

		<PageLayout
			definition={data.definition}
			version={data.version}
			components={STORE_BLOCKS}
			{track}
			{submit}
			state={funnelState}
			{mainClass}
			{rowClass}
			{colClass}
		/>

		<form
			method="POST"
			class="max-w-page px-gutter mx-auto flex flex-col gap-6"
			use:enhance={submitOrder}
		>
			{@render hiddenFields()}

			<section class="flex flex-col gap-4">
				<h2 class="text-21 tracking-headline text-fx-ink font-bold">
					{t('checkout.paymentTitle')}
				</h2>

				{#if data.paymentsEnabled && data.stripePublishableKey && !cardUnavailable}
					<div class="rounded-field border border-[#d8d5cf] bg-white p-4">
						<!-- Stripe.js is a third-party script on a phone connection, and an
						     empty bordered box reads as a broken checkout. Say what it is
						     waiting for until the fields report themselves ready. -->
						<!-- Stripe's fields mount only for an amount above zero, so with
						     nothing in the cart they never come, and "Loading" would wait
						     forever. Say what is missing instead. -->
						{#if isEmpty && priced !== null}
							<p class="text-15 text-fx-muted">
								{emptyNote ? t('checkout.paymentPick') : t('checkout.paymentEmpty')}
							</p>
						{:else if !cardApi}
							<p class="text-15 text-fx-muted">{t('checkout.paymentLoading')}</p>
						{/if}
						<CardFields
							publishableKey={data.stripePublishableKey}
							paymentMethodConfiguration={data.stripePaymentMethodConfiguration}
							amountCents={totalCents}
							{currency}
							onready={onCardReady}
						/>
					</div>
				{:else}
					<p class="rounded-field text-15 text-fx-sub border border-[#d8d5cf] bg-white px-4 py-3">
						{data.paymentsEnabled ? t('checkout.paymentHostedNote') : t('checkout.paymentPending')}
					</p>
				{/if}
			</section>

			<section class="flex flex-col gap-4">
				<h2 class="text-21 tracking-headline text-fx-ink font-bold">
					{t('checkout.summaryTitle')}
				</h2>

				<div class="rounded-field border border-[#d8d5cf] bg-white px-4 py-4">
					{#if priced === null && priceFailed}
						{@render priceRetry()}
					{:else if priced === null}
						<p class="text-15 text-fx-muted">{t('common.loading')}</p>
					{:else if isEmpty && emptyNote}
						<p class="text-15 text-fx-sub">{emptyNote}</p>
					{:else if isEmpty}
						<p class="text-15 text-fx-sub">{t('cart.empty')}</p>
						<a href={continueHref} class="text-15 text-fx-ink mt-2 inline-block font-medium underline">
							{t('cart.emptyAction')}
						</a>
					{:else}
						<ul class="flex flex-col gap-3">
							{#each priced.lines as line (line.variantId)}
								<li class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-15 text-fx-ink font-medium">{line.title}</p>
										<p class="text-13 text-fx-muted">
											{colourName(line.colour)} · {line.size}{#if !canStep(line)}
												· {t('cart.quantity')} {line.quantity}{/if}
										</p>
										{@render lineControls(line, false)}
									</div>
									<span class="text-15 text-fx-ink font-semibold whitespace-nowrap tabular-nums">
										{formatMoney(line.unitPriceCents * line.quantity, locale, currency)}
									</span>
								</li>
							{/each}
						</ul>

						<dl class="mt-4 flex flex-col gap-2 border-t border-[#e2e0dc] pt-4">
							<div class="text-15 flex justify-between">
								<dt class="text-fx-sub">{t('checkout.subtotal')}</dt>
								<dd class="text-fx-ink tabular-nums">
									{formatMoney(subtotalCents, locale, currency)}
								</dd>
							</div>
							{#if discountCents > 0}
								<div class="text-15 flex justify-between text-[#2f6b3d]">
									<dt>{t('checkout.bundleDiscount')} ({bundlePercentOff}%)</dt>
									<dd class="tabular-nums">−{formatMoney(discountCents, locale, currency)}</dd>
								</div>
							{/if}
							<div class="text-15 flex justify-between">
								<dt class="text-fx-sub">{t('checkout.shipping')}</dt>
								<dd class="text-fx-ink tabular-nums">
									{shippingCents === 0
										? t('checkout.free')
										: formatMoney(shippingCents, locale, currency)}
								</dd>
							</div>
							<div
								class="text-19 text-fx-ink flex justify-between border-t border-[#e2e0dc] pt-3 font-bold"
							>
								<dt>{t('checkout.total')}</dt>
								<dd class="tabular-nums">{formatMoney(totalCents, locale, currency)}</dd>
							</div>
						</dl>
					{/if}
				</div>
			</section>

			{@render alerts()}
			{@render payButton()}
		</form>
	</div>
{/if}

<style>
	/*
	 * Redefines the token for THIS SUBTREE ONLY.
	 *
	 * `--font-sans` is global and the live funnel renders through the same
	 * stylesheet — changing it in layout.css would restyle /quiz, /lp and
	 * /checkout-dr*, which must keep rendering identically. Scoping it to the
	 * page's root element means everything inside inherits Poppins and nothing
	 * outside notices.
	 */
	.storefront-type {
		--font-sans: 'Poppins', ui-sans-serif, system-ui, sans-serif;
		font-family: var(--font-sans);
	}
</style>
