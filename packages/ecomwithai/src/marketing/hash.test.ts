/**
 * Unit tests for Meta advanced-matching normalization. Runs offline and never
 * contacts Meta — the point is to catch silently-wrong hashes, which the live
 * API accepts happily while matching nobody.
 *
 *   npm test
 */
import { createHash } from 'node:crypto';
import { buildFbc, buildUserData, normalize, resolveFbc, sha256Hex } from './hash.ts';

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

// --- normalization ---
check('email trims and lowercases', normalize.email('  Vish@Example.COM '), 'vish@example.com');
check('phone keeps digits only', normalize.phone('+1 (650) 555-1212'), '16505551212');
check('phone drops leading zeros', normalize.phone('0044 20 7946 0958'), '442079460958');
check('name strips punctuation', normalize.name("O'Brien-Smith"), 'obriensmith');
check('name keeps non-ascii letters', normalize.name('Ángela'), 'ángela');
check('city removes spaces', normalize.city('São Paulo'), 'sãopaulo');
check('state accepts 2-letter code', normalize.state('CA'), 'ca');
check('state omits full names rather than truncating', normalize.state('Texas'), '');
check('zip strips dashes', normalize.zip('1100-001'), '1100001');
check('zip truncates US ZIP+4 to 5', normalize.zip('94107-1234'), '94107');
check('country accepts alpha-2', normalize.country('PT'), 'pt');
check('country omits full names', normalize.country('Portugal'), '');

// --- hashing matches a reference implementation ---
const reference = createHash('sha256').update('vish@example.com').digest('hex');
check('sha256 matches node crypto', await sha256Hex('vish@example.com'), reference);

// --- payload shape ---
const userData = await buildUserData({
	email: ' Vish@Example.com ',
	phone: undefined,
	firstName: 'Vish',
	lastName: 'Adlamani',
	city: 'Lisbon',
	state: 'Texas',
	zip: '1100-001',
	country: 'PT',
	clientIpAddress: '203.0.113.7',
	clientUserAgent: 'Mozilla/5.0',
	fbp: 'fb.1.1558571054389.1098115397',
	fbc: 'fb.1.1554763741205.AbCdEfGh'
});

check('email hashed and wrapped in an array', userData.em, [reference]);
check('absent phone is omitted, not null', 'ph' in userData, false);
check('unmatchable state is omitted', 'st' in userData, false);
check(
	'country hashed as alpha-2',
	userData.country,
	[createHash('sha256').update('pt').digest('hex')]
);
check('client ip is not hashed', userData.client_ip_address, '203.0.113.7');
check('user agent is not hashed', userData.client_user_agent, 'Mozilla/5.0');
check('fbp is not hashed', userData.fbp, 'fb.1.1558571054389.1098115397');
check('fbc is not hashed', userData.fbc, 'fb.1.1554763741205.AbCdEfGh');

// --- fbc construction ---
check('fbc format', buildFbc('AbCdEfGh', 1554763741205), 'fb.1.1554763741205.AbCdEfGh');

// --- fbc selection ---
// Meta's own example click id: mixed case, `-` and `_`. It must reach Meta
// exactly as issued, so every case below compares the exact string.
const CLICK = 'IwAR2F4-dbP0l7Mn1IawQQGCINEz7PYXQvwjNwB_qa2ofrHyiLjcbCRxTDMgk';
const NOW = 1700000000123;
const STORED = `fb.1.1554763741205.${CLICK}`;

check('no cookie, no fbclid: no fbc', resolveFbc(undefined, null, NOW), undefined);
check('cookie only: sent verbatim', resolveFbc(STORED, null, NOW), STORED);
check(
	'cookie with an appendix is still valid',
	resolveFbc(`${STORED}.AQ`, null, NOW),
	`${STORED}.AQ`
);
check('fbclid only: minted, case kept', resolveFbc(undefined, CLICK, NOW), `fb.1.${NOW}.${CLICK}`);
check(
	'cookie already holding this click keeps its timestamp',
	resolveFbc(STORED, CLICK, NOW),
	STORED
);
check(
	'a new click beats a stale cookie',
	resolveFbc('fb.1.1554763741205.OlderClickId', CLICK, NOW),
	`fb.1.${NOW}.${CLICK}`
);
check(
	'a click differing only in case is a different click',
	resolveFbc(`fb.1.1554763741205.${CLICK.toLowerCase()}`, CLICK, NOW),
	`fb.1.${NOW}.${CLICK}`
);
for (const bad of ['testclickid', 'fb.1.abc.Click', 'fb.1.1554763741205.', 'fb.1.1554763741205', '']) {
	check(`malformed cookie "${bad}" is dropped`, resolveFbc(bad, null, NOW), undefined);
}
check(
	'malformed cookie falls back to the fbclid',
	resolveFbc('not-an-fbc', CLICK, NOW),
	`fb.1.${NOW}.${CLICK}`
);

console.log(failures ? `\n${failures} failure(s)` : '\nAll normalization checks passed.');
process.exitCode = failures ? 1 : 0;
