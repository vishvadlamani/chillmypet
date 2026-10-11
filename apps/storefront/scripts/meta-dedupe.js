/**
 * Reads back Meta's own deduplication figures for the dataset, per event: the
 * numbers Events Manager shows under Deduplication, without Events Manager.
 *
 *   npm run meta:dedupe
 *
 * Two goals, from Meta's recommendations:
 *   - 95% of server events carry the event_id dedupe key;
 *   - 75% of browser events are covered by a server copy (Meta's "event
 *     coverage", unless it states its own goal).
 *
 * Every event this codebase and the landing pages send carries the browser's
 * event_id on both halves, so a low figure is almost never the payload. It is
 * either history (coverage is a 7-day average, so a fix takes a week to show in
 * full) or the server half not arriving, which /api/meta-status on each site
 * answers directly.
 *
 * Uses the Dataset Quality API with META_CAPI_ACCESS_TOKEN. Exits non-zero
 * when an event misses a goal, or when Meta will not answer.
 */
import { appendFile, readFile } from 'node:fs/promises';

const DEFAULT_ENDPOINT = 'https://graph.facebook.com';
const DEFAULT_API_VERSION = 'v25.0';
const SERVER_GOAL = 95;
const COVERAGE_GOAL = 75;

const fail = (headline, ...rest) => {
	console.error(`FAIL  ${headline}`);
	for (const line of rest) console.error(`      ${line}`);
	process.exit(1);
};

const toml = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
const pixelId = process.env.META_PIXEL_ID || toml.match(/^\s*META_PIXEL_ID\s*=\s*"(\d+)"/m)?.[1];
const token = process.env.META_CAPI_ACCESS_TOKEN;
const endpoint = process.env.META_CAPI_ENDPOINT || DEFAULT_ENDPOINT;
const version = process.env.META_CAPI_API_VERSION || DEFAULT_API_VERSION;

if (!pixelId) fail('no META_PIXEL_ID, in the environment or in wrangler.toml.');
if (!token) fail('META_CAPI_ACCESS_TOKEN is not set.', 'It is the token the Worker sends events with.');

const metric = '{percentage,description}';

/** One request; Meta's docs spell the dedupe field two ways, so the name is a parameter. */
async function ask(dedupeField) {
	const fields =
		`web{event_name,event_coverage{percentage,goal_percentage,description},` +
		`${dedupeField}{dedupe_key,browser_events_with_dedupe_key${metric},` +
		`server_events_with_dedupe_key${metric},overall_browser_coverage_from_dedupe_key${metric}}}`;
	const query = new URLSearchParams({ dataset_id: pixelId, fields, access_token: token });
	let response;
	try {
		response = await fetch(`${endpoint}/${version}/dataset_quality?${query}`);
	} catch (error) {
		fail(`could not reach ${endpoint}.`, String(error));
	}
	return { response, body: await response.json().catch(() => null) };
}

let dedupeField = 'dedupe_key_feedback';
let { response, body } = await ask(dedupeField);
if (!response.ok && /dedupe_key_feedback/.test(body?.error?.message ?? '')) {
	dedupeField = 'dedup_key_feedback';
	({ response, body } = await ask(dedupeField));
}

if (!response.ok) {
	// Meta may quote a token it cannot parse; this output lands in CI logs.
	const message = (body?.error?.message ?? `HTTP ${response.status}`).split(token).join('[token]');
	fail(
		`Meta would not report on dataset ${pixelId}.`,
		message,
		'',
		'The Dataset Quality API needs a token that may read this dataset. If this is',
		'the Worker token and it is refused here, the same figures are in Events',
		`Manager: https://business.facebook.com/events_manager2/list/dataset/${pixelId}/overview`,
		'Whether that token can *send* is a separate question: npm run meta:check.'
	);
}

const pct = (m) => (typeof m?.percentage === 'number' ? m.percentage : undefined);
const show = (n) => (n === undefined ? '—' : `${Math.round(n)}%`);

const rows = (body?.web ?? []).map((e) => {
	const feedback = [].concat(e[dedupeField] ?? []);
	const byEventId = feedback.find((f) => f.dedupe_key === 'event_id');
	const coverageGoal = pct({ percentage: e.event_coverage?.goal_percentage }) ?? COVERAGE_GOAL;
	const server = pct(byEventId?.server_events_with_dedupe_key);
	const coverage = pct(e.event_coverage);
	return {
		event: e.event_name,
		server,
		browser: pct(byEventId?.browser_events_with_dedupe_key),
		coverage,
		coverageGoal,
		// Meta only reports what it has; a missing figure is not a pass.
		ok: server !== undefined && server >= SERVER_GOAL && coverage !== undefined && coverage >= coverageGoal,
		notes: [...new Set([e.event_coverage?.description, byEventId?.server_events_with_dedupe_key?.description].filter(Boolean))]
	};
});

if (rows.length === 0) {
	fail(`Meta returned no events for dataset ${pixelId}.`, JSON.stringify(body));
}

const header = ['event', 'server events with event_id', 'browser events with event_id', 'coverage (goal)'];
const table = rows.map((r) => [
	`${r.ok ? 'PASS' : 'FAIL'}  ${r.event}`,
	show(r.server),
	show(r.browser),
	`${show(r.coverage)} (${show(r.coverageGoal)})`
]);
const widths = header.map((h, i) => Math.max(h.length + (i === 0 ? 6 : 0), ...table.map((row) => row[i].length)));
const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('   ');

console.log(`Dataset ${pixelId}, as Meta reports it. Coverage is a 7-day average.\n`);
console.log(line([`      ${header[0]}`, ...header.slice(1)]));
for (const row of table) console.log(line(row));
for (const r of rows.filter((r) => !r.ok && r.notes.length)) {
	console.log(`\n${r.event}: ${r.notes.join(' ')}`);
}

// On a GitHub Actions run, the same table on the run's summary page.
if (process.env.GITHUB_STEP_SUMMARY) {
	const md = [
		`### Meta deduplication, dataset ${pixelId}`,
		'',
		`Goals: ${SERVER_GOAL}% of server events with event_id, ${COVERAGE_GOAL}% coverage. Coverage is a 7-day average.`,
		'',
		`| | ${header.join(' | ')} |`,
		`|---|---|---|---|---|`,
		...rows.map((r) => `| ${r.ok ? '✅' : '❌'} | ${r.event} | ${show(r.server)} | ${show(r.browser)} | ${show(r.coverage)} (${show(r.coverageGoal)}) |`),
		''
	].join('\n');
	await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
}

const missed = rows.filter((r) => !r.ok).length;
if (missed) {
	console.log(`\n${missed} event(s) below goal. If /api/meta-status reads "accepted" on every site, give it a week.`);
	process.exit(1);
}
console.log('\nEvery event meets both goals.');
