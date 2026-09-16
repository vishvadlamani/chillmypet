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

/**
 * One Conversions API destination: a dataset, and the token authorising it.
 *
 * A token is issued for a single dataset, so reaching a second one is never a
 * matter of adding an id to a list — it needs its own credential, and a token
 * presented against any other dataset is refused.
 */
export type MetaDataset = {
	pixelId: string;
	accessToken?: string;
	/** Test event codes are issued per dataset, so each carries its own. */
	testEventCode?: string;
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
	/**
	 * Datasets beyond the primary that receive the same server-side events.
	 *
	 * Two ad accounts measuring one storefront each need their own conversions
	 * server-side, and posting the event once per dataset is what gives both the
	 * half that iOS and ad blockers eat. Each is posted independently, so one
	 * dataset rejecting an event never costs another its copy.
	 */
	additionalDatasets?: MetaDataset[];
};

export type CapiEvent = {
	eventName: MetaEventName;
	eventId: string;
	eventTime?: number;
	eventSourceUrl?: string;
	user: CapiUserInput;
	customData?: MetaCustomData;
};

/** What one dataset made of the event. `pixelId` is what names a failure. */
export type CapiDatasetResult = {
	pixelId: string;
	sent: boolean;
	reason?: 'not_configured' | 'request_failed';
	detail?: string;
	response?: unknown;
};

/**
 * `sent` is true once any dataset has accepted the event, and `results` carries
 * the per-dataset outcome — with more than one destination, "it failed" stops
 * being a single answer.
 */
export type CapiResult =
	| { sent: true; response: unknown; results: CapiDatasetResult[] }
	| {
			sent: false;
			reason: 'not_configured' | 'request_failed';
			detail?: string;
			results: CapiDatasetResult[];
	  };

export interface MetaService {
	isConfigured(): boolean;
	/** Split out so tests can assert the body without a network call. */
	buildEventPayload(event: CapiEvent): Promise<Record<string, unknown>>;
	send(event: CapiEvent): Promise<CapiResult>;
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

/** The `fbc` value Meta expects when a visitor lands with `?fbclid=`. */
export function buildFbc(fbclid: string, createdAt: number): string {
	return `fb.1.${createdAt}.${fbclid}`;
}

export function createMetaService(config: MetaConfig): MetaService {
	const version = config.apiVersion || DEFAULT_API_VERSION;
	const endpoint = config.endpoint || DEFAULT_ENDPOINT;

	/**
	 * Every destination for this event, primary first. A dataset carrying no
	 * token is dropped rather than posted to: the call would be refused, and an
	 * id on its own is not a credential.
	 */
	const destinations = (): MetaDataset[] =>
		[
			{
				pixelId: config.pixelId,
				accessToken: config.accessToken,
				testEventCode: config.testEventCode
			},
			...(config.additionalDatasets ?? [])
		].filter((dataset) => Boolean(dataset.pixelId && dataset.accessToken));

	/** Never rejects: the fan-out below wants an outcome for every dataset. */
	async function post(
		dataset: MetaDataset,
		payload: Record<string, unknown>
	): Promise<CapiDatasetResult> {
		const body: Record<string, unknown> = {
			data: [payload],
			access_token: dataset.accessToken
		};
		if (dataset.testEventCode) body.test_event_code = dataset.testEventCode;

		try {
			const response = await fetch(`${endpoint}/${version}/${dataset.pixelId}/events`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const parsed = await response.json().catch(() => null);

			if (!response.ok) {
				// The id is logged because a token pointed at the wrong dataset
				// surfaces here and nowhere else, and the id is what says which one.
				console.error('Meta CAPI rejected event', dataset.pixelId, response.status, parsed);
				return {
					pixelId: dataset.pixelId,
					sent: false,
					reason: 'request_failed',
					detail: `HTTP ${response.status}`
				};
			}
			return { pixelId: dataset.pixelId, sent: true, response: parsed };
		} catch (error) {
			console.error('Meta CAPI request failed', dataset.pixelId, error);
			return {
				pixelId: dataset.pixelId,
				sent: false,
				reason: 'request_failed',
				detail: String(error)
			};
		}
	}

	return {
		isConfigured() {
			return destinations().length > 0;
		},

		async buildEventPayload(event) {
			const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000);

			const payload: Record<string, unknown> = {
				event_name: event.eventName,
				event_time: eventTime,
				event_id: event.eventId,
				action_source: 'website',
				user_data: await buildUserData(event.user),
				original_event_data: { event_name: event.eventName, event_time: eventTime }
			};

			if (event.eventSourceUrl) payload.event_source_url = event.eventSourceUrl;
			if (event.customData) payload.custom_data = event.customData;
			if (config.attributionShare) {
				payload.attribution_data = { attribution_share: config.attributionShare };
			}

			return payload;
		},

		/** Never throws: a marketing pixel must not be able to fail an order. */
		async send(event) {
			const targets = destinations();
			if (targets.length === 0) return { sent: false, reason: 'not_configured', results: [] };

			// Built once and shared. The payload does not vary by dataset, and
			// user_data costs a SHA-256 per field — rebuilding it per destination
			// would pay that again for a byte-identical result.
			const payload = await this.buildEventPayload(event);
			const results = await Promise.all(targets.map((dataset) => post(dataset, payload)));

			const delivered = results.find((result) => result.sent);
			if (delivered) return { sent: true, response: delivered.response, results };

			return {
				sent: false,
				reason: results[0].reason ?? 'request_failed',
				detail: results[0].detail,
				results
			};
		}
	};
}
