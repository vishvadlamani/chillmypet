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
	/** Some of the money came back. The order was still delivered. */
	| 'partially_refunded'
	/** The cardholder went to their bank. There is an evidence deadline. */
	| 'disputed'
	/** The issuer flagged the card as fraudulent before any dispute was filed. */
	| 'fraud_warning'
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
	| {
			handled: true;
			eventType: string;
			orderNumber: string | null;
			action: string;
			/**
			 * Human-readable context for the actions a person has to answer —
			 * a dispute's deadline, a fraud warning's charge. The caller turns
			 * this into an alert; it is not part of any state machine.
			 */
			detail?: string;
	  }
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
	/**
	 * Refund automatically when Radar issues an early fraud warning.
	 *
	 * Refunding before an EFW becomes a chargeback avoids the dispute fee and
	 * the win-rate problem, which is why it is tempting. It is off by default
	 * anyway: a warning is the issuer's suspicion, not a finding, and taking a
	 * paying customer's order away on suspicion is a decision a person makes
	 * once, deliberately — not a default a library picks for them.
	 */
	autoRefundOnFraudWarning?: boolean;
}): PaymentService {
	const { db, storeId, orders, catalog, stripe } = deps;
	const provider = deps.provider ?? 'stripe';
	const restockOnRefund = deps.restockOnRefund ?? true;
	const autoRefundOnFraudWarning = deps.autoRefundOnFraudWarning ?? false;

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

			const markPaid = async () => {
				if (!orderNumber) return { handled: false as const, reason: 'order_not_found' as const };
				const row = await orderRow(orderNumber);
				if (!row) return { handled: false as const, reason: 'order_not_found' as const };

				// A completed session is not necessarily a paid one. Delayed methods
				// — bank debits, vouchers, some wallets — complete the session while
				// the money is still clearing, and settle minutes to days later with
				// `async_payment_succeeded`. Fulfilling on the session alone ships
				// goods against a payment that can still fail.
				const paymentStatus = object.payment_status;
				if (
					typeof paymentStatus === 'string' &&
					paymentStatus !== 'paid' &&
					paymentStatus !== 'no_payment_required'
				) {
					const applied = await processOnce(eventId, eventType, async () => {
						/* nothing changes: the order is already pending_payment */
					});
					return applied
						? {
								handled: true as const,
								eventType,
								orderNumber,
								action: 'payment_pending',
								detail: paymentStatus
							}
						: { handled: false as const, reason: 'duplicate' as const };
				}

				// The amount is asserted, never assumed: a session created elsewhere,
				// or edited, must not be able to settle an order for less than it costs.
				const paidCents = Number(object.amount_total ?? object.amount_received ?? NaN);
				const expected = Number(row.total_cents);
				const paidCurrency = String(object.currency ?? '').toLowerCase();
				const expectedCurrency = String(row.currency).toLowerCase();

				if (
					!Number.isFinite(paidCents) ||
					paidCents !== expected ||
					(paidCurrency && paidCurrency !== expectedCurrency)
				) {
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
					return {
						handled: false as const,
						reason: 'amount_mismatch' as const,
						detail: `expected ${expected}, got ${paidCents}`
					};
				}

				// One order, one transition to paid — whatever reports it.
				//
				// Event-id dedup only stops the *same* event being applied twice. A
				// hosted Checkout Session produces two different events that both mean
				// "this order is paid" (`checkout.session.completed` and
				// `payment_intent.succeeded`, since the session copies its metadata
				// onto the intent), and an on-page Payment Element produces only the
				// second. So the guard that matters is the order's own status, applied
				// as a condition on the write: whichever event arrives first wins the
				// row, the other sees rowsAffected 0 and reports `already_paid`. That
				// is what keeps fulfilment — and the conversion the caller reports off
				// `order_paid` — exactly once per sale.
				let transitioned = false;
				const applied = await processOnce(eventId, eventType, async (tx) => {
					await tx.execute({
						sql: `update payments set status = 'succeeded', provider_ref = coalesce(provider_ref, ?),
						      updated_at = datetime('now')
						      where store_id = ? and order_id = ?`,
						args: [sessionOrIntentId, storeId, Number(row.id)]
					});
					const moved = await tx.execute({
						sql: `update orders set status = 'paid'
						      where store_id = ? and id = ? and status <> 'paid'`,
						args: [storeId, Number(row.id)]
					});
					transitioned = moved.rowsAffected > 0;
				});

				if (!applied) return { handled: false as const, reason: 'duplicate' as const };
				return transitioned
					? { handled: true as const, eventType, orderNumber, action: 'order_paid' }
					: { handled: true as const, eventType, orderNumber, action: 'already_paid' };
			};

			const releaseStock = async (
				status: PaymentStatus,
				orderStatus: string,
				options: { onlyIfUnpaid: boolean },
				/** For charge-shaped events, where the order was recovered separately. */
				resolvedOrderNumber?: string
			) => {
				const orderNumber = resolvedOrderNumber ?? meta.orderNumber;
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

			/**
			 * What a charge-shaped event tells us, from either the object itself
			 * (`charge.refunded`) or a retrieval (a dispute and a fraud warning only
			 * reference one).
			 */
			type ChargeFacts = {
				id: string | null;
				paymentIntentId: string | null;
				amountCents: number | null;
				refundedCents: number | null;
				metadataOrderNumber: string | null;
			};

			const readCharge = (o: Record<string, unknown>): ChargeFacts => {
				const intent = o.payment_intent;
				const metadata = (o.metadata ?? {}) as Record<string, unknown>;
				const numberOrNull = (v: unknown) => (v === undefined || v === null ? null : Number(v));
				return {
					id: o.id === undefined ? null : String(o.id),
					paymentIntentId:
						intent === undefined || intent === null
							? null
							: typeof intent === 'string'
								? intent
								: String((intent as { id?: unknown }).id ?? ''),
					amountCents: numberOrNull(o.amount),
					refundedCents: numberOrNull(o.amount_refunded),
					metadataOrderNumber:
						metadata.order_number === undefined ? null : String(metadata.order_number)
				};
			};

			// Retrieval failures propagate: the caller answers 5xx and Stripe
			// redelivers. Swallowing one would turn a transient API blip into a
			// dispute nobody ever hears about, and there is a deadline on those.
			const fetchCharge = async (id: string): Promise<ChargeFacts> => {
				const charge = await stripe.getCharge(id);
				return {
					id: charge.id,
					paymentIntentId: charge.paymentIntentId,
					amountCents: charge.amount,
					refundedCents: charge.amountRefunded,
					metadataOrderNumber: charge.metadata.order_number ?? null
				};
			};

			const orderNumberByProviderRef = async (ref: string): Promise<string | null> => {
				const result = await db.execute({
					sql: `select o.order_number from payments p
					      join orders o on o.id = p.order_id
					      where p.store_id = ? and p.provider = ? and p.provider_ref = ?
					      order by p.id desc limit 1`,
					args: [storeId, provider, ref]
				});
				const row = result.rows[0];
				return row ? String(row.order_number) : null;
			};

			/**
			 * Which order a charge belongs to, cheapest source first: the metadata
			 * Stripe copied from the intent, then the payment row written when the
			 * intent was created, then the intent itself. The last one matters for
			 * hosted sessions, where the payment row holds the *session* id and the
			 * charge only knows its intent.
			 */
			const orderNumberForCharge = async (facts: ChargeFacts): Promise<string | null> => {
				if (facts.metadataOrderNumber) return facts.metadataOrderNumber;
				if (!facts.paymentIntentId) return null;
				const known = await orderNumberByProviderRef(facts.paymentIntentId);
				if (known) return known;
				const intent = await stripe.getPaymentIntent(facts.paymentIntentId);
				return intent.metadata.order_number ?? null;
			};

			/**
			 * Records a state a person has to answer — a dispute, a fraud warning,
			 * a partial refund. Money and stock are untouched: none of these means
			 * the goods came back, and a partial refund gives no way to know which
			 * line it was against.
			 */
			const flag = async (input: {
				orderNumber: string;
				paymentStatus: PaymentStatus;
				orderStatus: string;
				action: string;
				detail: string;
				/** Statuses this must not overwrite, because they say more. */
				keep?: string[];
			}): Promise<WebhookOutcome> => {
				const row = await orderRow(input.orderNumber);
				if (!row) return { handled: false, reason: 'order_not_found' };

				const keep = input.keep ?? [];
				const applied = await processOnce(eventId, eventType, async (tx) => {
					await tx.execute({
						sql: `update payments set status = ?, failure_reason = ?, updated_at = datetime('now')
						      where store_id = ? and order_id = ?`,
						args: [input.paymentStatus, input.detail, storeId, Number(row.id)]
					});
					const placeholders = keep.map(() => '?').join(', ');
					await tx.execute({
						sql: `update orders set status = ? where store_id = ? and id = ?${
							keep.length ? ` and status not in (${placeholders})` : ''
						}`,
						args: [input.orderStatus, storeId, Number(row.id), ...keep]
					});
				});

				return applied
					? {
							handled: true,
							eventType,
							orderNumber: input.orderNumber,
							action: input.action,
							detail: input.detail
						}
					: { handled: false, reason: 'duplicate' };
			};

			switch (eventType) {
				// The single fulfilment trigger for a hosted Checkout Session, and
				// the only signal at all for an on-page Payment Element — that flow
				// creates no session, so `payment_intent.succeeded` is the one event
				// that says the money arrived. Both land here; the order's status is
				// what makes the transition happen exactly once.
				case 'checkout.session.completed':
				case 'checkout.session.async_payment_succeeded':
				case 'payment_intent.succeeded':
					return markPaid();

				// The delayed payment never cleared, so the order it was holding
				// stock for is dead. Without this the order hangs pending forever and
				// the stock with it.
				case 'checkout.session.async_payment_failed':
					return releaseStock('failed', 'cancelled', { onlyIfUnpaid: true });

				case 'checkout.session.expired':
					return releaseStock('expired', 'cancelled', { onlyIfUnpaid: true });

				case 'charge.refunded':
				case 'refund.created': {
					// `charge.refunded` carries the charge; `refund.created` carries a
					// refund that references one, and the running total only exists on
					// the charge.
					const inline = eventType === 'charge.refunded' ? readCharge(object) : null;
					const chargeId =
						inline?.id ?? (object.charge === undefined ? null : String(object.charge));

					let facts = inline && inline.refundedCents !== null ? inline : null;
					if (!facts && chargeId) {
						try {
							facts = await fetchCharge(chargeId);
						} catch (error) {
							// Unlike a dispute, this event can still be applied without the
							// retrieval: the name says the charge was refunded, and the
							// pre-split behaviour was to treat that as the whole thing.
							// Failing the request instead would have Stripe retry a charge
							// that may never resolve, and a redelivery storm eventually
							// costs the endpoint.
							console.error('Could not retrieve charge for refund split', chargeId, error);
							facts = inline;
						}
					}
					if (!facts) return { handled: false, reason: 'order_not_found' };

					const resolved = orderNumber ?? (await orderNumberForCharge(facts));
					if (!resolved) return { handled: false, reason: 'order_not_found' };

					// Partial or full is the difference between "we took one item back"
					// and "the sale is undone". Assuming full restocks goods the
					// customer still has and cancels an order still being shipped.
					const partial =
						facts.amountCents !== null &&
						facts.refundedCents !== null &&
						facts.refundedCents > 0 &&
						facts.refundedCents < facts.amountCents;

					if (partial) {
						return flag({
							orderNumber: resolved,
							paymentStatus: 'partially_refunded',
							orderStatus: 'partially_refunded',
							action: 'refund_partial',
							detail: `${facts.refundedCents} of ${facts.amountCents} refunded`,
							// A later full refund still wins; an earlier one is not undone.
							keep: ['refunded']
						});
					}

					return releaseStock('refunded', 'refunded', { onlyIfUnpaid: false }, resolved);
				}

				// The cardholder went to their bank. There is a hard evidence
				// deadline, so this has to reach a person — the caller alerts on the
				// action, and the detail is what they need to act.
				case 'charge.dispute.created': {
					const chargeId = object.charge === undefined ? null : String(object.charge);
					if (!chargeId) return { handled: false, reason: 'order_not_found' };
					const resolved = orderNumber ?? (await orderNumberForCharge(await fetchCharge(chargeId)));
					if (!resolved) return { handled: false, reason: 'order_not_found' };

					const amount = object.amount === undefined ? null : Number(object.amount);
					const dueBy = (object.evidence_details as { due_by?: unknown } | undefined)?.due_by;
					const detail = [
						amount === null ? null : `${amount} ${String(object.currency ?? '').toUpperCase()}`,
						object.reason ? `reason: ${String(object.reason)}` : null,
						typeof dueBy === 'number'
							? `evidence due ${new Date(dueBy * 1000).toISOString()}`
							: null
					]
						.filter(Boolean)
						.join(' · ');

					return flag({
						orderNumber: resolved,
						paymentStatus: 'disputed',
						orderStatus: 'disputed',
						action: 'dispute_opened',
						detail: detail || chargeId
					});
				}

				// Radar heard from the issuer before the cardholder filed anything.
				// Refunding now costs the sale but avoids the dispute fee — which is
				// a judgement call, so it is off unless the store opted in.
				case 'radar.early_fraud_warning.created': {
					const chargeId = object.charge === undefined ? null : String(object.charge);
					if (!chargeId) return { handled: false, reason: 'order_not_found' };
					const facts = await fetchCharge(chargeId);
					const resolved = orderNumber ?? (await orderNumberForCharge(facts));
					if (!resolved) return { handled: false, reason: 'order_not_found' };

					let refundNote = 'not refunded (auto-refund off)';
					if (autoRefundOnFraudWarning && facts.paymentIntentId) {
						try {
							const refund = await stripe.refund({
								paymentIntentId: facts.paymentIntentId,
								reason: 'fraudulent',
								idempotencyKey: `efw:${storeId}:${chargeId}`
							});
							refundNote = `refunded ${refund.amountCents}`;
						} catch (error) {
							// The warning still has to be recorded and alerted on. A
							// refund that failed is the operator's problem to finish, not
							// a reason to lose the warning.
							refundNote = `auto-refund failed: ${String(error)}`;
						}
					}

					return flag({
						orderNumber: resolved,
						paymentStatus: 'fraud_warning',
						orderStatus: 'fraud_warning',
						action: 'fraud_warning',
						detail: `${String(object.fraud_type ?? 'unknown')} on ${chargeId} · ${refundNote}`,
						// A refund or a filed dispute both say more than a warning does.
						keep: ['refunded', 'partially_refunded', 'disputed']
					});
				}

				default:
					// Stripe sends far more event types than any store needs; recording
					// them all would just fill the dedup table.
					return { handled: false, reason: 'ignored', detail: eventType };
			}
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

			// The payment row holds whichever object was created for this order: a
			// PaymentIntent on the on-page path, a Checkout Session on the hosted
			// one. Stripe's refund endpoint only takes the intent, so a session id
			// has to be exchanged for the intent it produced — passing `cs_...`
			// here is rejected, which is a refund that fails exactly when someone
			// is trying to undo a sale.
			const paymentIntentId = payment.providerRef.startsWith('cs_')
				? (await stripe.getCheckoutSession(payment.providerRef)).paymentIntentId
				: payment.providerRef;
			if (!paymentIntentId) {
				throw new Error(`No payment intent behind "${orderNumber}" to refund`);
			}

			const result = await stripe.refund({
				paymentIntentId,
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
	restockOnRefund?: boolean;
	autoRefundOnFraudWarning?: boolean;
}): PaymentService {
	return createPaymentService({
		db: deps.db,
		storeId: deps.storeId,
		orders: deps.orders,
		catalog: deps.catalog,
		stripe: createStripeClient(deps.config),
		restockOnRefund: deps.restockOnRefund,
		autoRefundOnFraudWarning: deps.autoRefundOnFraudWarning
	});
}
