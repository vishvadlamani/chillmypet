import { withBusyRetry, type Client } from '../db/index.ts';
import type { CatalogService } from '../catalog/index.ts';
import type { Order, OrderService } from '../orders/index.ts';
import { createStripeClient, type StripeClient, type StripeConfig } from './stripe.ts';

export * from './signature.ts';
export {
	createStripeClient,
	encodeForm,
	StripeError,
	type StripeClient,
	type StripeConfig
} from './stripe.ts';

export type PaymentStatus =
	| 'pending'
	| 'succeeded'
	| 'failed'
	| 'expired'
	| 'refunded'
	| 'amount_mismatch';

export type Payment = {
	id: number;
	orderNumber: string;
	provider: string;
	providerRef: string | null;
	status: PaymentStatus;
	amountCents: number;
	currency: string;
	failureReason: string | null;
};

export type StartCheckoutResult = {
	/** Hosted mode: send the customer here. Null in embedded mode. */
	url: string | null;
	/**
	 * Embedded mode: hand to Stripe.js to mount the form on your own page. Null
	 * in hosted mode. Either way the card is entered in a Stripe-owned context
	 * and never reaches this application.
	 */
	clientSecret: string | null;
	sessionId: string;
	orderNumber: string;
	amountCents: number;
};

export type WebhookOutcome =
	| { handled: true; eventType: string; orderNumber: string | null; action: string }
	| {
			handled: false;
			reason:
				| 'invalid_signature'
				| 'duplicate'
				| 'ignored'
				| 'order_not_found'
				| 'wrong_store'
				| 'amount_mismatch';
			detail?: string;
	  };

export interface PaymentService {
	startCheckout(input: {
		orderNumber: string;
		/** Hosted mode. */
		successUrl?: string;
		cancelUrl?: string;
		/** Embedded mode: where Stripe returns once the on-page form completes. */
		returnUrl?: string;
		uiMode?: 'hosted' | 'embedded';
		metadata?: Record<string, string>;
	}): Promise<StartCheckoutResult>;
	/**
	 * Payment for an order, to be completed by Stripe's Payment Element inside
	 * your own checkout form — no redirect, no second step.
	 */
	startPayment(input: {
		orderNumber: string;
		metadata?: Record<string, string>;
	}): Promise<{ clientSecret: string; paymentIntentId: string; amountCents: number }>;
	/**
	 * Pass the raw request body — not a parsed object. Re-serializing JSON
	 * changes bytes and the signature will never match.
	 */
	handleWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookOutcome>;
	/**
	 * Settles an order by asking Stripe what happened, instead of waiting to be
	 * told.
	 *
	 * The webhook is the primary path and stays so, but it is one delivery away
	 * from silence: an endpoint subscribed to the wrong events, a secret rotated,
	 * an outage. Nothing about that failure is visible from here — the order
	 * simply stays `pending_payment` while the card was charged, and a sale that
	 * never settles is never reported. Call this wherever the customer surfaces
	 * after paying; it is idempotent, it asserts the same amount the webhook
	 * does, and it returns `order_paid` only for the call that actually applied
	 * the change, so the conversion is still reported exactly once.
	 */
	reconcile(input: { orderNumber: string }): Promise<WebhookOutcome>;
	refund(input: {
		orderNumber: string;
		amountCents?: number;
		reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
	}): Promise<{ refundId: string; amountCents: number }>;
	byOrderNumber(orderNumber: string): Promise<Payment | null>;
}

/** Reads routing fields without verifying — use only to pick a tenant, never to trust. */
export function peekStripeEvent(rawBody: string): {
	id: string | null;
	type: string | null;
	storeId: string | null;
	orderNumber: string | null;
} {
	try {
		const event = JSON.parse(rawBody) as Record<string, unknown>;
		const object = ((event.data as Record<string, unknown>)?.object ?? {}) as Record<
			string,
			unknown
		>;
		const metadata = (object.metadata ?? {}) as Record<string, unknown>;
		return {
			id: event.id === undefined ? null : String(event.id),
			type: event.type === undefined ? null : String(event.type),
			storeId: metadata.store_id === undefined ? null : String(metadata.store_id),
			orderNumber:
				metadata.order_number !== undefined
					? String(metadata.order_number)
					: object.client_reference_id !== undefined && object.client_reference_id !== null
						? String(object.client_reference_id)
						: null
		};
	} catch {
		return { id: null, type: null, storeId: null, orderNumber: null };
	}
}

function toPayment(row: Record<string, unknown>): Payment {
	return {
		id: Number(row.id),
		orderNumber: String(row.order_number),
		provider: String(row.provider),
		providerRef: row.provider_ref === null ? null : String(row.provider_ref),
		status: String(row.status) as PaymentStatus,
		amountCents: Number(row.amount_cents),
		currency: String(row.currency),
		failureReason: row.failure_reason === null ? null : String(row.failure_reason)
	};
}

export function createPaymentService(deps: {
	db: Client;
	storeId: string;
	orders: OrderService;
	catalog: CatalogService;
	stripe: StripeClient;
	provider?: string;
	/**
	 * Whether a refund returns the goods to stock. True suits most stores; set
	 * false when refunds are typically goodwill and the customer keeps the item.
	 */
	restockOnRefund?: boolean;
}): PaymentService {
	const { db, storeId, orders, catalog, stripe } = deps;
	const provider = deps.provider ?? 'stripe';
	const restockOnRefund = deps.restockOnRefund ?? true;

	async function orderRow(orderNumber: string) {
		const result = await db.execute({
			sql: 'select id, total_cents, currency, status from orders where store_id = ? and order_number = ?',
			args: [storeId, orderNumber]
		});
		return result.rows[0] ?? null;
	}

	/** Returns stock taken by an order so it can be given back. */
	async function orderLines(orderId: number) {
		const result = await db.execute({
			sql: 'select variant_id, quantity from order_items where store_id = ? and order_id = ?',
			args: [storeId, orderId]
		});
		return result.rows.map((r) => ({
			variantId: Number(r.variant_id),
			quantity: Number(r.quantity)
		}));
	}

	/**
	 * The one place an order becomes `paid`.
	 *
	 * Reached from two directions — a webhook Stripe sent, and `reconcile`
	 * reading the same fact back off Stripe — so the assertion that the money
	 * matches the order lives here rather than in either caller. Each path
	 * passes its own `eventId`, which makes it idempotent against repeats of
	 * itself; the already-paid check below is what makes the two idempotent
	 * against each other, so whichever arrives second reports nothing.
	 */
	async function settleOrder(input: {
		orderNumber: string;
		eventId: string;
		eventType: string;
		providerRef: string;
		paidCents: number;
		paidCurrency: string;
	}): Promise<WebhookOutcome> {
		const { orderNumber, eventId, eventType, providerRef, paidCents } = input;
		const row = await orderRow(orderNumber);
		if (!row) return { handled: false, reason: 'order_not_found' };

		const alreadyPaid = String(row.status) === 'paid';

		// The amount is asserted first, and regardless of what the order already
		// says: a session created elsewhere, or edited, must not be able to settle
		// an order for less than it costs, and an underpayment is worth refusing
		// out loud even when it arrives too late to do damage.
		const expected = Number(row.total_cents);
		const paidCurrency = input.paidCurrency.toLowerCase();
		const expectedCurrency = String(row.currency).toLowerCase();

		if (
			!Number.isFinite(paidCents) ||
			paidCents !== expected ||
			(paidCurrency && paidCurrency !== expectedCurrency)
		) {
			// Recorded only while the order is still open. Letting a stray
			// underpayment stamp `amount_mismatch` onto a payment that already
			// succeeded would make a settled sale look like a failed one.
			if (!alreadyPaid) {
				await processOnce(eventId, eventType, async (tx) => {
					await tx.execute({
						sql: `update payments set status = 'amount_mismatch',
						      failure_reason = ?, updated_at = datetime('now')
						      where store_id = ? and order_id = ?`,
						args: [
							`expected ${expected} ${expectedCurrency}, got ${paidCents} ${paidCurrency}`,
							storeId,
							Number(row.id)
						]
					});
				});
			}
			return {
				handled: false,
				reason: 'amount_mismatch',
				detail: `expected ${expected}, got ${paidCents}`
			};
		}

		// Settled already, by the other path. Reporting this as a duplicate rather
		// than a fresh `order_paid` is what stops one sale becoming two
		// conversions when a late webhook lands on a receipt-settled order.
		if (alreadyPaid) return { handled: false, reason: 'duplicate' };

		const applied = await processOnce(eventId, eventType, async (tx) => {
			await tx.execute({
				sql: `update payments set status = 'succeeded', provider_ref = coalesce(provider_ref, ?),
				      updated_at = datetime('now')
				      where store_id = ? and order_id = ?`,
				args: [providerRef, storeId, Number(row.id)]
			});
			await tx.execute({
				sql: `update orders set status = 'paid' where store_id = ? and id = ?`,
				args: [storeId, Number(row.id)]
			});
		});

		return applied
			? { handled: true, eventType, orderNumber, action: 'order_paid' }
			: { handled: false, reason: 'duplicate' };
	}

	/**
	 * Records the event and applies the state change together. The unique
	 * constraint on (provider, event_id) is what makes redelivery a no-op — if
	 * the insert loses, nothing else in the transaction runs.
	 */
	async function processOnce(
		eventId: string,
		eventType: string,
		apply: (tx: Awaited<ReturnType<Client['transaction']>>) => Promise<void>
	): Promise<boolean> {
		return withBusyRetry(async () => {
			const seen = await db.execute({
				sql: 'select 1 from payment_events where provider = ? and event_id = ?',
				args: [provider, eventId]
			});
			if (seen.rows.length > 0) return false;

			const tx = await db.transaction('write');
			try {
				await tx.execute({
					sql: `insert into payment_events (provider, event_id, type, store_id)
					      values (?, ?, ?, ?)`,
					args: [provider, eventId, eventType, storeId]
				});
				await apply(tx);
				await tx.commit();
				return true;
			} catch (error) {
				try {
					await tx.rollback();
				} catch {
					/* already closed */
				}
				// A concurrent delivery won the unique constraint: that is success,
				// handled by the other worker, not an error to surface.
				const raced = await db.execute({
					sql: 'select 1 from payment_events where provider = ? and event_id = ?',
					args: [provider, eventId]
				});
				if (raced.rows.length > 0) return false;
				throw error;
			}
		});
	}

	return {
		async startCheckout({
			orderNumber,
			successUrl,
			cancelUrl,
			returnUrl,
			uiMode = 'hosted',
			metadata
		}) {
			const order = await orders.byNumber(orderNumber);
			if (!order) throw new Error(`No order "${orderNumber}"`);

			const session = await stripe.createCheckoutSession({
				order,
				successUrl,
				cancelUrl,
				returnUrl,
				uiMode,
				storeId,
				metadata
			});

			// Whichever mode was asked for, the thing that mounts the form has to
			// come back — a session without it is unusable and better surfaced here
			// than as a blank payment step.
			if (uiMode === 'embedded' ? !session.clientSecret : !session.url) {
				throw new Error(`Stripe returned an unusable ${uiMode} session for ${orderNumber}`);
			}

			const row = await orderRow(orderNumber);
			await withBusyRetry(() =>
				db.execute({
					sql: `insert into payments
					        (store_id, order_id, provider, provider_ref, status, amount_cents, currency)
					      values (?, ?, ?, ?, 'pending', ?, ?)
					      on conflict (provider, provider_ref) do update set
					        status = 'pending', updated_at = datetime('now')`,
					args: [
						storeId,
						Number(row!.id),
						provider,
						session.id,
						order.totalCents,
						order.currency
					]
				})
			);

			return {
				url: session.url,
				clientSecret: session.clientSecret,
				sessionId: session.id,
				orderNumber,
				amountCents: order.totalCents
			};
		},

		async startPayment({ orderNumber, metadata }) {
			const order = await orders.byNumber(orderNumber);
			if (!order) throw new Error(`No order "${orderNumber}"`);

			const intent = await stripe.createPaymentIntent({
				order,
				storeId,
				metadata,
				idempotencyKey: `intent:${storeId}:${orderNumber}`
			});

			// The intent is the order total outright, so there is no coupon to
			// reconcile — but the amount is still asserted on the way back in, in
			// case the intent was altered after it was created.
			const row = await orderRow(orderNumber);
			await withBusyRetry(() =>
				db.execute({
					sql: `insert into payments
					        (store_id, order_id, provider, provider_ref, status, amount_cents, currency)
					      values (?, ?, ?, ?, 'pending', ?, ?)
					      on conflict (provider, provider_ref) do update set
					        status = 'pending', updated_at = datetime('now')`,
					args: [storeId, Number(row!.id), provider, intent.id, order.totalCents, order.currency]
				})
			);

			return {
				clientSecret: intent.clientSecret,
				paymentIntentId: intent.id,
				amountCents: intent.amountCents
			};
		},

		async handleWebhook(rawBody, signatureHeader) {
			const verification = await stripe.verifyWebhook(rawBody, signatureHeader);
			if (!verification.valid) {
				return { handled: false, reason: 'invalid_signature', detail: verification.reason };
			}

			const event = JSON.parse(rawBody) as Record<string, unknown>;
			const eventId = String(event.id ?? '');
			const eventType = String(event.type ?? '');
			const object = ((event.data as Record<string, unknown>)?.object ?? {}) as Record<
				string,
				unknown
			>;
			const meta = peekStripeEvent(rawBody);

			// Signature proves Stripe sent it; it does not prove it belongs to this
			// tenant. A multi-tenant deployment must route before handling.
			if (meta.storeId && meta.storeId !== storeId) {
				return { handled: false, reason: 'wrong_store', detail: meta.storeId };
			}

			const orderNumber = meta.orderNumber;
			const sessionOrIntentId = String(object.id ?? '');

			const markPaid = async (): Promise<WebhookOutcome> => {
				if (!orderNumber) return { handled: false, reason: 'order_not_found' };
				return settleOrder({
					orderNumber,
					eventId,
					eventType,
					providerRef: sessionOrIntentId,
					// A session reports `amount_total`, an intent `amount_received`.
					paidCents: Number(object.amount_total ?? object.amount_received ?? NaN),
					paidCurrency: String(object.currency ?? '')
				});
			};

			const releaseStock = async (
				status: PaymentStatus,
				orderStatus: string,
				options: { onlyIfUnpaid: boolean }
			) => {
				if (!orderNumber) return { handled: false as const, reason: 'order_not_found' as const };
				const row = await orderRow(orderNumber);
				if (!row) return { handled: false as const, reason: 'order_not_found' as const };

				// Abandonment must not restock an order that already settled — a late
				// `expired` after a successful payment would inflate inventory. A
				// refund is the opposite case: the order did settle, and the goods are
				// coming back.
				if (options.onlyIfUnpaid && String(row.status) === 'paid') {
					return { handled: false as const, reason: 'ignored' as const, detail: 'already paid' };
				}
				if (!options.onlyIfUnpaid && String(row.status) === 'refunded') {
					return { handled: false as const, reason: 'ignored' as const, detail: 'already refunded' };
				}

				if (!restockOnRefund && !options.onlyIfUnpaid) {
					// Money is returned but the goods are not, so only the statuses move.
					const applied = await processOnce(eventId, eventType, async (tx) => {
						await tx.execute({
							sql: `update payments set status = ?, updated_at = datetime('now')
							      where store_id = ? and order_id = ?`,
							args: [status, storeId, Number(row.id)]
						});
						await tx.execute({
							sql: `update orders set status = ? where store_id = ? and id = ?`,
							args: [orderStatus, storeId, Number(row.id)]
						});
					});
					return applied
						? { handled: true as const, eventType, orderNumber, action: `refunded:no_restock` }
						: { handled: false as const, reason: 'duplicate' as const };
				}

				const lines = await orderLines(Number(row.id));
				const applied = await processOnce(eventId, eventType, async (tx) => {
					for (const line of lines) {
						await tx.execute({
							sql: `update product_variants set stock = stock + ?
							      where id = ? and store_id = ?`,
							args: [line.quantity, line.variantId, storeId]
						});
					}
					await tx.execute({
						sql: `update payments set status = ?, updated_at = datetime('now')
						      where store_id = ? and order_id = ?`,
						args: [status, storeId, Number(row.id)]
					});
					await tx.execute({
						sql: `update orders set status = ? where store_id = ? and id = ?`,
						args: [orderStatus, storeId, Number(row.id)]
					});
				});

				return applied
					? { handled: true as const, eventType, orderNumber, action: `stock_released:${status}` }
					: { handled: false as const, reason: 'duplicate' as const };
			};

			switch (eventType) {
				case 'checkout.session.completed':
				case 'checkout.session.async_payment_succeeded':
				case 'payment_intent.succeeded':
					return markPaid();

				case 'checkout.session.expired':
				case 'checkout.session.async_payment_failed':
					return releaseStock('expired', 'cancelled', { onlyIfUnpaid: true });

				case 'charge.refunded':
				case 'refund.created':
					return releaseStock('refunded', 'refunded', { onlyIfUnpaid: false });

				default:
					// Stripe sends far more event types than any store needs; recording
					// them all would just fill the dedup table.
					return { handled: false, reason: 'ignored', detail: eventType };
			}
		},

		async reconcile({ orderNumber }) {
			const row = await orderRow(orderNumber);
			if (!row) return { handled: false, reason: 'order_not_found' };
			// Already settled, so there is nothing to apply and nothing to report:
			// whichever path got here first sent the conversion.
			if (String(row.status) === 'paid') return { handled: false, reason: 'duplicate' };

			const payment = await this.byOrderNumber(orderNumber);
			const ref = payment?.providerRef;
			// An order placed with no payment provider, or one whose intent was
			// never created. There is nothing at Stripe to ask about.
			if (!ref) return { handled: false, reason: 'ignored', detail: 'no payment reference' };

			// One settlement criterion, whichever path took the money: an intent
			// Stripe says succeeded, for the amount Stripe says it captured. A
			// Checkout Session is followed to its intent rather than judged on its
			// own status, because a session reads `complete` as soon as the
			// customer finishes the form — including for delayed methods that have
			// taken nothing yet.
			let intentId = ref;
			if (!ref.startsWith('pi_')) {
				const session = await stripe.getCheckoutSession(ref);
				if (!session.paymentIntentId) {
					return { handled: false, reason: 'ignored', detail: `session ${session.status}` };
				}
				intentId = session.paymentIntentId;
			}

			const intent = await stripe.getPaymentIntent(intentId);
			if (intent.status !== 'succeeded') {
				return { handled: false, reason: 'ignored', detail: intent.status };
			}

			return settleOrder({
				orderNumber,
				// Stable, and deliberately not shaped like a Stripe event id: reading
				// the same intent again settles nothing twice, while a real webhook
				// for this sale stays free to arrive and finds the order already paid.
				eventId: `reconcile:${intentId}`,
				eventType: 'reconcile:payment_intent.succeeded',
				providerRef: intentId,
				paidCents: Number(intent.amountReceived ?? NaN),
				paidCurrency: intent.currency ?? ''
			});
		},

		async refund({ orderNumber, amountCents, reason }) {
			const payment = await this.byOrderNumber(orderNumber);
			if (!payment) throw new Error(`No payment for order "${orderNumber}"`);
			if (payment.status !== 'succeeded') {
				throw new Error(`Order "${orderNumber}" is ${payment.status}, not succeeded`);
			}
			if (!payment.providerRef) {
				throw new Error(`Payment for "${orderNumber}" has no provider reference`);
			}

			const result = await stripe.refund({
				paymentIntentId: payment.providerRef,
				amountCents,
				reason,
				idempotencyKey: `refund:${storeId}:${orderNumber}:${amountCents ?? 'full'}`
			});

			// Status moves to refunded when the webhook lands, so the same code path
			// handles both an API refund and one issued from the Stripe dashboard.
			return { refundId: result.id, amountCents: result.amountCents };
		},

		async byOrderNumber(orderNumber) {
			const result = await db.execute({
				sql: `select p.id, o.order_number, p.provider, p.provider_ref, p.status,
				             p.amount_cents, p.currency, p.failure_reason
				      from payments p
				      join orders o on o.id = p.order_id
				      where p.store_id = ? and o.order_number = ?
				      order by p.id desc limit 1`,
				args: [storeId, orderNumber]
			});
			const row = result.rows[0];
			return row ? toPayment(row as Record<string, unknown>) : null;
		}
	};
}

/** Convenience: build the Stripe-backed payment service in one call. */
export function createStripePayments(deps: {
	db: Client;
	storeId: string;
	orders: OrderService;
	catalog: CatalogService;
	config: StripeConfig;
}): PaymentService {
	return createPaymentService({
		db: deps.db,
		storeId: deps.storeId,
		orders: deps.orders,
		catalog: deps.catalog,
		stripe: createStripeClient(deps.config)
	});
}
