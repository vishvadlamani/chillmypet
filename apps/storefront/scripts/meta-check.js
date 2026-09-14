/**
 * Proves the Conversions API token belongs to the pixel the ads run on.
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

// Asking Meta what the token can reach, rather than trusting that it was pasted
// against the right pixel. A token scoped to another dataset returns an error
// here — the same error it would return, once per event, forever, in silence.
const url = `${endpoint}/${version}/${pixelId}?fields=id,name&access_token=${encodeURIComponent(token)}`;

let response;
let body;
try {
	response = await fetch(url);
	body = await response.json().catch(() => null);
} catch (error) {
	fail(`could not reach ${endpoint}.`, String(error));
}

if (!response.ok) {
	const message = body?.error?.message ?? `HTTP ${response.status}`;
	fail(
		`the token cannot read pixel ${pixelId}.`,
		message,
		'',
		'A Conversions API token is scoped to one dataset. If this token belongs to',
		'a different pixel, Meta rejects every server event and says so nowhere you',
		'would look. Generate the token from Events Manager for this pixel:',
		`  https://business.facebook.com/events_manager2/list/dataset/${pixelId}/settings`
	);
}

// Meta echoes the id it resolved. Identical by construction here, but a
// redirect or a proxy in front of the endpoint could make it otherwise, and a
// mismatch is the whole thing this script exists to catch.
if (body?.id && String(body.id) !== String(pixelId)) {
	fail(
		`the token resolved to dataset ${body.id}, not ${pixelId}.`,
		'Events would be reported to a pixel the ad account does not optimise against.'
	);
}

const name = body?.name ? ` "${body.name}"` : '';
console.log(`PASS  the token belongs to pixel ${pixelId}${name}.`);
console.log('      Server-side events have somewhere to arrive.');
