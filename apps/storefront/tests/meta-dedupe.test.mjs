/**
 * `npm run meta:dedupe`, offline: the script runs for real against a stand-in
 * for the Dataset Quality API, so what it reads, how it judges the goals and
 * what it prints are all checked without a token or a network.
 *
 *   node tests/meta-dedupe.test.mjs
 */
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let failures = 0;
function check(label, cond, detail) {
	console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond || !detail ? '' : ` — ${detail}`}`);
	if (!cond) failures++;
}

const TOKEN = 'EAAdedupeTestToken0123456789';
let answer;
const asked = [];
const graph = createServer((req, res) => {
	asked.push(new URL(req.url, 'http://x'));
	const [status, body] = answer(asked.at(-1));
	res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});
await new Promise((r) => graph.listen(0, '127.0.0.1', r));
const endpoint = `http://127.0.0.1:${graph.address().port}`;

const dir = mkdtempSync(join(tmpdir(), 'meta-dedupe-'));
const summary = join(dir, 'summary.md');
const run = () =>
	new Promise((resolve) => {
		execFile(
			process.execPath,
			[new URL('../scripts/meta-dedupe.js', import.meta.url).pathname],
			{
				env: {
					PATH: process.env.PATH,
					META_CAPI_ACCESS_TOKEN: TOKEN,
					META_CAPI_ENDPOINT: endpoint,
					GITHUB_STEP_SUMMARY: summary
				}
			},
			(error, stdout, stderr) => resolve({ code: error ? error.code : 0, out: stdout + stderr })
		);
	});

const event = (name, server, coverage, field = 'dedupe_key_feedback') => ({
	event_name: name,
	event_coverage: { percentage: coverage, goal_percentage: 75, description: `${name} coverage` },
	[field]: [
		{ dedupe_key: 'event_id', browser_events_with_dedupe_key: { percentage: 100 }, server_events_with_dedupe_key: { percentage: server } },
		{ dedupe_key: 'fbp', server_events_with_dedupe_key: { percentage: 100 } }
	]
});

// --- goals met ---
answer = () => [200, { web: [event('ViewContent', 100, 92), event('PageView', 98, 80)] }];
{
	const { code, out } = await run();
	const q = asked.at(-1);
	check('asks for the dataset in wrangler.toml', q.pathname === '/v25.0/dataset_quality' && q.searchParams.get('dataset_id') === '1341978141149107', q.href);
	check('for coverage and the dedupe keys, per event', /event_coverage\{/.test(q.searchParams.get('fields')) && /dedupe_key_feedback\{dedupe_key/.test(q.searchParams.get('fields')));
	check('passes when every event meets both goals', code === 0 && /Every event meets both goals/.test(out), out);
	check('and says which figure is which', /PASS\s+ViewContent\s+100%\s+100%\s+92% \(75%\)/.test(out), out);
}

// --- the warning Events Manager raised ---
answer = () => [200, { web: [event('ViewContent', 0, 0), event('PageView', 99, 90)] }];
{
	rmSync(summary, { force: true });
	const { code, out } = await run();
	check('fails when server events lack the event_id key', code === 1 && /FAIL\s+ViewContent\s+0%/.test(out), out);
	check('and names only the event that misses', /PASS\s+PageView/.test(out) && /1 event\(s\) below goal/.test(out), out);
	check('with Meta’s own explanation', /ViewContent: ViewContent coverage/.test(out), out);
	const md = readFileSync(summary, 'utf8');
	check('and writes the table to the Actions run summary', /\| ❌ \| ViewContent \| 0% \| 100% \| 0% \(75%\) \|/.test(md), md);
}

// --- a figure Meta does not report is not a pass ---
answer = () => [200, { web: [{ event_name: 'AddToCart', event_coverage: { percentage: 90 } }] }];
{
	const { code, out } = await run();
	check('an event with no dedupe figures fails rather than passes', code === 1 && /FAIL\s+AddToCart\s+—/.test(out), out);
}

// --- the docs' other spelling of the field ---
answer = (q) =>
	/dedupe_key_feedback/.test(q.searchParams.get('fields'))
		? [400, { error: { message: '(#100) Tried accessing nonexisting field (dedupe_key_feedback)', code: 100 } }]
		: [200, { web: [event('ViewContent', 100, 90, 'dedup_key_feedback')] }];
{
	const { code, out } = await run();
	check('retries with dedup_key_feedback when Meta does not know the other', code === 0 && /PASS\s+ViewContent\s+100%/.test(out), out);
}

// --- a token that may send but not read ---
answer = () => [400, { error: { message: `(#200) Missing permission for ${TOKEN}`, code: 200 } }];
{
	const { code, out } = await run();
	check('a refusal fails and points to Events Manager', code === 1 && /would not report/.test(out) && /events_manager2/.test(out), out);
	check('never printing the token', !out.includes(TOKEN), out);
}

graph.close();
rmSync(dir, { recursive: true, force: true });
if (failures) {
	console.log(`\n${failures} failure(s)`);
	process.exit(1);
}
console.log('\nmeta:dedupe OK.');
