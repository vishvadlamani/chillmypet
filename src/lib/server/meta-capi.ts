import { env } from '$env/dynamic/private';
import { buildUserData, type CapiUserInput } from '$lib/analytics/hash';
import { META_PIXEL_ID, type MetaCustomData, type MetaEventName } from '$lib/analytics/meta';

export { buildFbc, type CapiUserInput } from '$lib/analytics/hash';

const DEFAULT_API_VERSION = 'v25.0';
const DEFAULT_ENDPOINT = 'https://graph.facebook.com';

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

export function isCapiConfigured(): boolean {
	return Boolean(env.META_CAPI_ACCESS_TOKEN);
}

/** The event body, split out so tests can assert on it without a network call. */
export async function buildEventPayload(event: CapiEvent): Promise<Record<string, unknown>> {
	const eventTime = event.eventTime ?? Math.floor(Date.now() / 1000);

	const payload: Record<string, unknown> = {
		event_name: event.eventName,
		event_time: eventTime,
		event_id: event.eventId,
		action_source: 'website',
		user_data: await buildUserData(event.user),
		original_event_data: {
			event_name: event.eventName,
			event_time: eventTime
		}
	};

	if (event.eventSourceUrl) payload.event_source_url = event.eventSourceUrl;
	if (event.customData) payload.custom_data = event.customData;
	if (env.META_ATTRIBUTION_SHARE) {
		payload.attribution_data = { attribution_share: env.META_ATTRIBUTION_SHARE };
	}

	return payload;
}

/**
 * Sends one event to the Conversions API. Never throws — a marketing pixel must
 * not be able to fail a customer's order.
 */
export async function sendCapiEvent(event: CapiEvent): Promise<CapiResult> {
	const token = env.META_CAPI_ACCESS_TOKEN;
	if (!token) return { sent: false, reason: 'not_configured' };

	const version = env.META_CAPI_API_VERSION || DEFAULT_API_VERSION;
	const payload = await buildEventPayload(event);

	const body: Record<string, unknown> = { data: [payload], access_token: token };
	if (env.META_CAPI_TEST_EVENT_CODE) body.test_event_code = env.META_CAPI_TEST_EVENT_CODE;

	try {
		// Overridable so tests can capture the payload, and so a CAPI Gateway or
		// server-side proxy can be dropped in without touching this code.
		const endpoint = env.META_CAPI_ENDPOINT || DEFAULT_ENDPOINT;

		const response = await fetch(
			`${endpoint}/${version}/${META_PIXEL_ID}/events`,
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}
		);

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
}
