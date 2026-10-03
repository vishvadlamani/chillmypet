/**
 * Proves the Conversions API token can post events to the pixel the ads run on.
 *
 * This is the check for the failure that cost this store a month. Neither half
 * of it is loud on its own: with no token `send()` returns `not_configured` and
 * posts nothing, and with a token belonging to another dataset Meta rejects
 * every event. Both only reach `console.error`, because tracking must never be
 * able to fail an order — so the first sign either way is a campaign reporting
 * no conversions, weeks later.
 *
 *   npm run meta:check
 *
 * META_PIXEL_ID comes from wrangler.toml, which is where the deployed Worker
 * reads it from. The token comes from the environment, so this verifies
 * whichever copy you hand it: run it locally against the real one, or in CI
 * against the repository secret. Exits non-zero on anything that would make the
 * server's half of the funnel silently stop arriving.
 */
import { readFile } from 'node:fs/promises';

const DEFAULT_ENDPOINT = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v25.0';

const fail = (headline, ...rest) => {
	console.error(`FAIL  ${headline}`);
	for (const line of rest) console.error(`      ${line}`);
	process.exit(1);
};

// A regex rather than a TOML parser: this is one flat key in a file we own, and
// the check should not need a dependency to run in CI.
const toml = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const declared = toml.match(/^\s*META_PIXEL_ID\s*=\s*"(\d+)"/m)?.[1];

const pixelId = process.env.META_PIXEL_ID ?? declared;
const token = process.env.META_CAPI_ACCESS_TOKEN;
const endpoint = process.env.META_CAPI_ENDPOINT || DEFAULT_ENDPOINT;
const version = process.env.META_CAPI_API_VERSION || DEFAULT_API_VERSION;

if (!pixelId) {
	fail(
		'no META_PIXEL_ID, in the environment or in wrangler.toml.',
		'Nothing initialises a pixel and no server event has a dataset to go to.'
	);
}

if (!token) {
	fail(
		'META_CAPI_ACCESS_TOKEN is not set.',
		'Browser events still fire; the server copy of every one of them does not,',
		'which is the half iOS and ad blockers eat. Set it where this runs:',
		'',
		'  Worker    cd apps/storefront && npx wrangler secret put META_CAPI_ACCESS_TOKEN',
		'  CI        add it as a repository secret, under Settings > Secrets > Actions'
	);
}

// Ask the events endpoint itself, with an empty batch.
//
// Reading the dataset node (GET /<id>?fields=id,name) looks like the obvious
// probe and is the wrong one: that needs permission to *read* the dataset,
// which a Conversions API token is not required to hold. A token that posts
// events perfectly well answers that read with "(#100) Missing Permission", so
// the read would block deploys over a token that was never broken.
//
// `data=[]` is refused during payload validation, which Meta only reaches once
// the token is allowed to post to this dataset — so this proves authorisation
// while sending no event and fabricating no conversion. The token goes in the
// body rather than the query string, where it would end up in access logs.
const url = `${endpoint}/${version}/${pixelId}/events`;

let response;
let body;
try {
	response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ data: '[]', access_token: token })
	});
	body = await response.json().catch(() => null);
} catch (error) {
	fail(`could not reach ${endpoint}.`, String(error));
}

const message = body?.error?.message ?? `HTTP ${response.status}`;
// Reaching "must be non-empty" means the request was authorised and only the
// payload was rejected. A mock endpoint that accepts the empty batch outright
// counts too.
const authorised = response.ok || /non-empty/i.test(message);

if (!authorised) {
	if (body?.error?.code === 190) {
		fail(
			'the token is not a valid access token.',
			message,
			'',
			'Expired, revoked, or mistyped — this one never posted an event and never',
			'will. Generate a fresh one from Events Manager for this pixel:',
			`  https://business.facebook.com/events_manager2/list/dataset/${pixelId}/settings`
		);
	}

	fail(
		`the token cannot post events to pixel ${pixelId}.`,
		message,
		'',
		'A Conversions API token is scoped to one dataset. If this token belongs to',
		'a different pixel, Meta rejects every server event and says so nowhere you',
		'would look. Generate the token from Events Manager for this pixel:',
		`  https://business.facebook.com/events_manager2/list/dataset/${pixelId}/settings`
	);
}

console.log(`PASS  the token can post events to pixel ${pixelId}.`);
console.log('      Server-side events have somewhere to arrive.');
