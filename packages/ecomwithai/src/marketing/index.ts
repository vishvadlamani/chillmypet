import { buildUserData, type CapiUserInput } from './hash.ts';

export * from './hash.ts';

const DEFAULT_API_VERSION = 'v25.0';
const DEFAULT_ENDPOINT = 'https://graph.facebook.com';

export type MetaEventName =
	| 'PageView'
	| 'ViewContent'
	| 'AddToCart'
	| 'InitiateCheckout'
	// Fired when someone submits their payment details, not when the form is
	// merely on screen — a checkout that reports it on page load teaches the
	// campaign that everyone who arrived was ready to pay.
	| 'AddPaymentInfo'
	| 'Purchase';

export type MetaCustomData = {
	currency?: string;
	value?: string;
	content_type?: 'product' | 'product_group';
	content_ids?: string[];
	contents?: { id: string; quantity: number; item_price?: number }[];
	num_items?: number;
};

/** Per-store: every storefront has its own pixel and its own access token. */
export type MetaConfig = {
	pixelId: string;
	accessToken?: string;
	apiVersion?: string;
	/** Override for a CAPI Gateway, a proxy, or a test capture server. */
	endpoint?: string;
	testEventCode?: string;
	attributionShare?: string;
};

export type CapiEvent = {
	eventName: MetaEventName;
	eventId: string;
	eventTime?: number;
	eventSourceUrl?: string;
	user: CapiUserInput;
	customData?: MetaCustomData;
};

export type CapiResult =
	| { sent: true; response: unknown }
	| { sent: false; reason: 'not_configured' | 'request_failed'; detail?: string };

export type CapiVerification =
	| { ok: true }
	| { ok: false; reason: 'not_configured' | 'rejected' | 'unreachable'; detail?: string };

export interface MetaService {
	/** The dataset every event from this service is posted to. */
	readonly pixelId: string;
	isConfigured(): boolean;
	/** Split out so tests can assert the body without a network call. */
	buildEventPayload(event: CapiEvent): Promise<Record<string, unknown>>;
	send(event: CapiEvent): Promise<CapiResult>;
	/**
	 * Whether Meta will take events from this token for this pixel, asked
	 * without sending one. `send()` cannot tell you: it never throws, so a token
	 * for another dataset is rejected once per event into a log, while the
	 * browser half keeps arriving and Events Manager reads it as the server
	 * sending events with no dedupe key and covering none of the browser's.
	 */
	verify(): Promise<CapiVerification>;
}

/**
 * Meta's error text, minus the token. Graph quotes a token it cannot parse back
 * in the message ("Malformed access token EAA…"), and a verification result is
 * the kind of thing that ends up on a status page.
 */
export function redactToken(text: string, token: string | undefined): string {
	const scrubbed = token ? text.split(token).join('[token]') : text;
	return scrubbed.replace(/EAA[A-Za-z0-9]{16,}/g, '[token]');
}

/** Meta wants value as a decimal string, and cents-to-currency must not drift. */
export function toAmount(cents: number): string {
	return (cents / 100).toFixed(2);
}

/**
 * Shared id for one logical conversion. The browser and the server both send the
 * event with this id so Meta counts it once instead of twice.
 */
export function newEventId(): string {
	return crypto.randomUUID();
}

export function createMetaService(config: MetaConfig): MetaService {
	return {
		pixelId: config.pixelId,

		isConfigured() {
			return Boolean(config.accessToken);
		},

		async buildEventPayload(event) {
			const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000);

			const payload: Record<string, unknown> = {
				event_name: event.eventName,
				event_time: eventTime,
				event_id: event.eventId,
				action_source: 'website',
				user_data: await buildUserData(event.user)
			};

			if (event.eventSourceUrl) payload.event_source_url = event.eventSourceUrl;
			if (event.customData) payload.custom_data = event.customData;
			// `original_event_data` describes the past acquisition a *delayed*
			// event belongs to, and it has an `event_id` of its own that Meta
			// dedupes on. Sent on every live event without one, it told Meta the
			// whole server stream had no dedupe key: Events Manager reported 0% of
			// server PageViews carrying an event ID and 0% coverage, while the
			// top-level `event_id` was there all along. It only belongs beside
			// `attribution_data`, and then it must carry the same id.
			if (config.attributionShare) {
				payload.attribution_data = { attribution_share: config.attributionShare };
				payload.original_event_data = {
					event_name: event.eventName,
					event_time: eventTime,
					event_id: event.eventId
				};
			}

			return payload;
		},

		/** Never throws: a marketing pixel must not be able to fail an order. */
		async send(event) {
			if (!config.accessToken) return { sent: false, reason: 'not_configured' };

			const version = config.apiVersion || DEFAULT_API_VERSION;
			const endpoint = config.endpoint || DEFAULT_ENDPOINT;
			const payload = await this.buildEventPayload(event);

			const body: Record<string, unknown> = {
				data: [payload],
				access_token: config.accessToken
			};
			if (config.testEventCode) body.test_event_code = config.testEventCode;

			try {
				const response = await fetch(`${endpoint}/${version}/${config.pixelId}/events`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				});
				const parsed = await response.json().catch(() => null);

				if (!response.ok) {
					console.error('Meta CAPI rejected event', response.status, parsed);
					return { sent: false, reason: 'request_failed', detail: `HTTP ${response.status}` };
				}
				return { sent: true, response: parsed };
			} catch (error) {
				console.error('Meta CAPI request failed', error);
				return { sent: false, reason: 'request_failed', detail: String(error) };
			}
		},

		async verify() {
			if (!config.accessToken) return { ok: false, reason: 'not_configured' };

			const version = config.apiVersion || DEFAULT_API_VERSION;
			const endpoint = config.endpoint || DEFAULT_ENDPOINT;

			// An empty batch, which Meta refuses as "must be non-empty" only once it
			// has accepted the token for this dataset. Reading the dataset node
			// instead would need a read permission a Conversions API token does not
			// have to hold, and would fail tokens that post perfectly well.
			try {
				const response = await fetch(`${endpoint}/${version}/${config.pixelId}/events`, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: new URLSearchParams({ data: '[]', access_token: config.accessToken })
				});
				const parsed = (await response.json().catch(() => null)) as {
					error?: { message?: string; code?: number };
				} | null;
				const message = parsed?.error?.message ?? `HTTP ${response.status}`;
				if (response.ok || /non-empty/i.test(message)) return { ok: true };

				const code = parsed?.error?.code;
				return {
					ok: false,
					reason: 'rejected',
					detail: redactToken(code === undefined ? message : `(#${code}) ${message}`, config.accessToken)
				};
			} catch (error) {
				return {
					ok: false,
					reason: 'unreachable',
					detail: redactToken(String(error), config.accessToken)
				};
			}
		}
	};
}
