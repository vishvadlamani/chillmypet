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
check('absent external id is omitted', 'external_id' in userData, false);

// --- external_id: the browser and server copies must carry the same string ---
const digest = createHash('sha256').update('visitor-42').digest('hex');
check(
	'external id is hashed when it is not a digest yet',
	(await buildUserData({ externalId: ' visitor-42 ' })).external_id,
	[digest]
);
check(
	'external id that is already a digest passes through, not hashed twice',
	(await buildUserData({ externalId: digest })).external_id,
	[digest]
);
check('blank external id is omitted', 'external_id' in (await buildUserData({ externalId: '  ' })), false);

// --- fbc construction ---
check('fbc format', buildFbc('AbCdEfGh', 1554763741205), 'fb.1.1554763741205.AbCdEfGh');

// --- fbc resolution: the URL's click id must reach Meta untouched ---
const now = 1700000000000;
check('fbc keeps the cookie when the URL has no click id', resolveFbc('fb.1.1554763741205.Old', null, now), 'fb.1.1554763741205.Old');
check('fbc mints from the URL when there is no cookie', resolveFbc(undefined, 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc keeps the cookie when it carries the same click id', resolveFbc('fb.1.1554763741205.NeW_Click-Id', 'NeW_Click-Id', now), 'fb.1.1554763741205.NeW_Click-Id');
check('fbc replaces a cookie from an earlier click', resolveFbc('fb.1.1554763741205.Old', 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc treats a case-only difference as a different click', resolveFbc('fb.1.1554763741205.new_click-id', 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc is absent with neither', resolveFbc(undefined, null, now), undefined);

console.log(failures ? `\n${failures} failure(s)` : '\nAll normalization checks passed.');
process.exitCode = failures ? 1 : 0;
