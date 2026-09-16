/**
 * Unit tests for the Conversions API fan-out. Runs offline — `fetch` is stubbed,
 * so nothing here reaches Meta.
 *
 * What these pin is the failure that is invisible in production: an event that
 * reaches one dataset and quietly never reaches another, which Events Manager
 * shows as a healthy dataset sitting next to an empty one. Nothing throws when
 * that happens, because tracking must never be able to fail an order.
 *
 *   npm test
 */
import { createMetaService, type CapiEvent, type MetaConfig } from './index.ts';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
	if (!ok) {
		console.log(`      expected ${JSON.stringify(expected)}`);
		console.log(`      actual   ${JSON.stringify(actual)}`);
		failures += 1;
	}
}

type Call = { url: string; body: Record<string, unknown> };

/** Records every request and answers however the test asked it to. */
function stubFetch(ok: (url: string) => boolean): Call[] {
	const calls: Call[] = [];
	globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
		const url = String(input);
		calls.push({ url, body: JSON.parse(String(init?.body)) });
		const accepted = ok(url);
		return {
			ok: accepted,
			status: accepted ? 200 : 400,
			json: async () => ({ events_received: accepted ? 1 : 0 })
		} as unknown as Response;
	}) as unknown as typeof fetch;
	return calls;
}

const PRIMARY = '1363695699271757';
const SECOND = '1341978141149107';

const event: CapiEvent = {
	eventName: 'AddToCart',
	eventId: 'evt-1',
	// Pinned so the two datasets' payloads are comparable byte for byte.
	eventTime: 1750000000,
	eventSourceUrl: 'https://chillmypet.com/products/dog-life-jacket',
	user: { clientIpAddress: '203.0.113.7', clientUserAgent: 'Mozilla/5.0' },
	customData: { currency: 'USD', value: '44.97' }
};

const twoDatasets: MetaConfig = {
	pixelId: PRIMARY,
	accessToken: 'primary-token',
	endpoint: 'https://capi.test',
	additionalDatasets: [{ pixelId: SECOND, accessToken: 'second-token' }]
};

// --- both datasets are reached, each with its own credential ---
{
	const calls = stubFetch(() => true);
	const result = await createMetaService(twoDatasets).send(event);

	check('one request per dataset', calls.length, 2);
	check('the primary dataset is posted to', calls[0].url, `https://capi.test/v25.0/${PRIMARY}/events`);
	check('the second dataset is posted to', calls[1].url, `https://capi.test/v25.0/${SECOND}/events`);
	// A token authorises one dataset. Swap these and Meta refuses both, which is
	// the whole reason datasets carry their token rather than pairing by index.
	check('the primary sends its own token', calls[0].body.access_token, 'primary-token');
	check('the second sends its own token', calls[1].body.access_token, 'second-token');
	check('both datasets accepted', result.sent, true);
	check(
		'each outcome is reported against its dataset',
		result.results.map((r) => [r.pixelId, r.sent]),
		[
			[PRIMARY, true],
			[SECOND, true]
		]
	);
}

// --- the conversion is one event, not two different ones ---
{
	const calls = stubFetch(() => true);
	await createMetaService(twoDatasets).send(event);

	// Same event_id in both: each dataset dedupes its server copy against its own
	// browser copy. A per-dataset id would leave every event counted twice.
	check('both carry the same payload', calls[0].body.data, calls[1].body.data);
}

// --- one dataset failing must not cost the other its copy ---
{
	const calls = stubFetch((url) => !url.includes(SECOND));
	const result = await createMetaService(twoDatasets).send(event);

	check('the healthy dataset was still posted to', calls.length, 2);
	check('a partial delivery still counts as sent', result.sent, true);
	check(
		'the failing dataset is named in the results',
		result.results.filter((r) => !r.sent).map((r) => [r.pixelId, r.reason]),
		[[SECOND, 'request_failed']]
	);
}

// --- every dataset failing ---
{
	stubFetch(() => false);
	const result = await createMetaService(twoDatasets).send(event);

	check('reports failure when nothing landed', result.sent, false);
	check('with a reason', result.sent === false && result.reason, 'request_failed');
	check('and every dataset accounted for', result.results.length, 2);
}

// --- a dataset with no token is not posted to ---
{
	const calls = stubFetch(() => true);
	const result = await createMetaService({
		...twoDatasets,
		additionalDatasets: [{ pixelId: SECOND }]
	}).send(event);

	// This is the state while a token is being generated: the id is configured so
	// the browser half initialises, but an unauthorised post would only be refused.
	check('the tokenless dataset is skipped', calls.length, 1);
	check('the primary still goes out', calls[0].url.includes(PRIMARY), true);
	check('and the send counts as delivered', result.sent, true);
}

// --- nothing configured at all ---
{
	const calls = stubFetch(() => true);
	const result = await createMetaService({ pixelId: PRIMARY }).send(event);

	check('no token means no request', calls.length, 0);
	check('and no silent pretence of success', result.sent, false);
	check('reported as unconfigured', result.sent === false && result.reason, 'not_configured');
}

// --- test event codes are per dataset ---
{
	const calls = stubFetch(() => true);
	await createMetaService({
		...twoDatasets,
		testEventCode: 'TEST1',
		additionalDatasets: [{ pixelId: SECOND, accessToken: 'second-token', testEventCode: 'TEST2' }]
	}).send(event);

	// A code is issued by one dataset's Test Events tab and means nothing to
	// another — sharing one would put real conversions in the ads numbers.
	check('the primary uses its own code', calls[0].body.test_event_code, 'TEST1');
	check('the second uses its own code', calls[1].body.test_event_code, 'TEST2');
}

console.log(failures ? `\n${failures} failure(s)` : '\nAll Conversions API fan-out checks passed.');
process.exitCode = failures ? 1 : 0;
