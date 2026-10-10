/**
 * Unit tests for Meta advanced-matching normalization. Runs offline and never
 * contacts Meta — the point is to catch silently-wrong hashes, which the live
 * API accepts happily while matching nobody.
 *
 *   npm test
 */
import { createHash } from 'node:crypto';
import { buildFbc, buildFbp, buildUserData, fbclidOf, normalize, resolveFbc, sha256Hex } from './hash.ts';
import { createMetaService } from './index.ts';

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

// --- external_id, and values the host already hashed ---
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const visitor = await buildUserData({
	externalId: ' 0f8e3c1a-visitor ',
	email: reference,
	phone: sha('16505551212')
});
check('external_id is trimmed and hashed', visitor.external_id, [sha('0f8e3c1a-visitor')]);
// Run through phone normalization, a digest would lose its letters and become
// a hash of a hash — accepted by Meta, matching nobody.
check('a pre-hashed phone passes through untouched', visitor.ph, [sha('16505551212')]);
check('a pre-hashed email passes through untouched', visitor.em, [reference]);
check('absent external_id is omitted', 'external_id' in userData, false);

// --- fbc construction ---
check('fbc format', buildFbc('AbCdEfGh', 1554763741205), 'fb.1.1554763741205.AbCdEfGh');
check('fbclid read back out of an fbc', fbclidOf('fb.1.1554763741205.AbC.d-E_f'), 'AbC.d-E_f');
check('fbclid of a malformed fbc', fbclidOf('nonsense'), undefined);

// --- fbp construction ---
check('fbp format', buildFbp(1558571054389, 1098115397), 'fb.1.1558571054389.1098115397');
check('minted fbp has the pixel shape', /^fb\.1\.\d{13}\.\d+$/.test(buildFbp(Date.now())), true);

// --- event payload: the dedupe key ---
// Meta dedupes on event_id, and `original_event_data` carries one of its own.
// Sent without it, Events Manager reported 0% of server events with an event ID.
const plain = await createMetaService({ pixelId: '1' }).buildEventPayload({
	eventName: 'PageView',
	eventId: 'abc-123',
	user: {}
});
check('event_id is at the top level', plain.event_id, 'abc-123');
check('no original_event_data on a live event', 'original_event_data' in plain, false);

const shared = await createMetaService({ pixelId: '1', attributionShare: '0.3' }).buildEventPayload({
	eventName: 'PageView',
	eventId: 'abc-123',
	eventTime: 1700000000,
	user: {}
});
check(
	'original_event_data, when sent, carries the same event_id',
	shared.original_event_data,
	{ event_name: 'PageView', event_time: 1700000000, event_id: 'abc-123' }
);

// --- fbc resolution: the URL's click id must reach Meta untouched ---
const now = 1700000000000;
check('fbc keeps the cookie when the URL has no click id', resolveFbc('fb.1.1554763741205.Old', null, now), 'fb.1.1554763741205.Old');
check('fbc mints from the URL when there is no cookie', resolveFbc(undefined, 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc keeps the cookie when it carries the same click id', resolveFbc('fb.1.1554763741205.NeW_Click-Id', 'NeW_Click-Id', now), 'fb.1.1554763741205.NeW_Click-Id');
check('fbc replaces a cookie from an earlier click', resolveFbc('fb.1.1554763741205.Old', 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc treats a case-only difference as a different click', resolveFbc('fb.1.1554763741205.new_click-id', 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');
check('fbc is absent with neither', resolveFbc(undefined, null, now), undefined);
check('fbc keeps a cookie carrying an appendix', resolveFbc('fb.1.1554763741205.Old.AQ', null, now), 'fb.1.1554763741205.Old.AQ');
for (const bad of ['testclickid', 'fb.1.abc.Old', 'fb.1.1554763741205.', 'fb.1.1554763741205', '']) {
	check(`fbc drops a malformed cookie "${bad}"`, resolveFbc(bad, null, now), undefined);
}
check('fbc mints from the URL over a malformed cookie', resolveFbc('not-an-fbc', 'NeW_Click-Id', now), 'fb.1.1700000000000.NeW_Click-Id');

console.log(failures ? `\n${failures} failure(s)` : '\nAll normalization checks passed.');
process.exitCode = failures ? 1 : 0;
