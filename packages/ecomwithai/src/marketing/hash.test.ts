/**
 * Unit tests for Meta advanced-matching normalization. Runs offline and never
 * contacts Meta — the point is to catch silently-wrong hashes, which the live
 * API accepts happily while matching nobody.
 *
 *   npm test
 */
import { createHash } from 'node:crypto';
import { buildFbc, buildUserData, isSha256Hex, newFbp, normalize, sha256Hex } from './hash.ts';

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
check('external id trims and lowercases', normalize.externalId(' Ab-12 '), 'ab-12');

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

// --- external_id ---
const visitorId = '7f1a3c22-0000-4000-8000-abcdefabcdef';
const visitorHash = createHash('sha256').update(visitorId).digest('hex');
const anonymous = await buildUserData({ externalId: visitorId });
check('external_id is hashed like any other field', anonymous.external_id, [visitorHash]);
check('a PageView with only an id sends only that', Object.keys(anonymous), ['external_id']);

// --- pre-hashed values, for identity remembered as a digest ---
const emailHash = createHash('sha256').update('vish@example.com').digest('hex');
const phoneHash = createHash('sha256').update('16505551212').digest('hex');

const remembered = await buildUserData({
	hashed: { email: emailHash, phone: phoneHash, externalId: visitorHash }
});
check('pre-hashed email passes through unhashed again', remembered.em, [emailHash]);
check('pre-hashed phone passes through unhashed again', remembered.ph, [phoneHash]);
check('pre-hashed external_id passes through', remembered.external_id, [visitorHash]);

// Hashing a hash matches nobody, and Meta accepts it without complaint — so a
// value that is not a digest has to be dropped, not sent.
const malformed = await buildUserData({ hashed: { email: 'vish@example.com' } });
check('a pre-hashed field that is not a digest is omitted', 'em' in malformed, false);
check('short hex is not a digest', isSha256Hex('abc123'), false);
check('uppercase hex is not a digest', isSha256Hex(emailHash.toUpperCase()), false);

// The order's own email is first-hand; a cookie's is from some earlier visit,
// possibly by someone else on the same browser.
const both = await buildUserData({
	email: 'buyer@example.com',
	hashed: { email: emailHash }
});
check(
	'a raw field wins over a remembered hash',
	both.em,
	[createHash('sha256').update('buyer@example.com').digest('hex')]
);

// --- fbc/fbp construction ---
check('fbc format', buildFbc('AbCdEfGh', 1554763741205), 'fb.1.1554763741205.AbCdEfGh');
check('fbp format matches what fbevents.js writes', /^fb\.1\.1554763741205\.\d+$/.test(newFbp(1554763741205)), true);
check('fbp is not the same value twice', newFbp(1554763741205) === newFbp(1554763741205), false);

console.log(failures ? `\n${failures} failure(s)` : '\nAll normalization checks passed.');
process.exitCode = failures ? 1 : 0;
