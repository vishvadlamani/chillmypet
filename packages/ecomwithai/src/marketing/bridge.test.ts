/**
 * The rules that decide what a browser is allowed to have the server send.
 *
 *   node --experimental-strip-types src/marketing/bridge.test.ts
 *
 * Every case here is something the endpoint would otherwise report to an ad
 * account: an event with no dedupe key (counted twice), revenue nobody was
 * charged, or a conversion claimed by whoever can reach the URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	BRIDGEABLE_EVENT_NAMES,
	isBridgeableEventName,
	isMetaEventName,
	parseBrowserEvent,
	sanitizeCustomData
} from './bridge.ts';

const ORIGIN = 'https://chillmypet.com';

test('accepts a well-formed browser event', () => {
	const event = parseBrowserEvent(
		{
			eventName: 'ViewContent',
			eventId: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0',
			eventSourceUrl: `${ORIGIN}/products/dog-life-jacket`,
			customData: { currency: 'usd', value: '44.97', content_ids: ['dog-life-jacket'] }
		},
		ORIGIN
	);

	assert.equal(event?.eventName, 'ViewContent');
	assert.equal(event?.eventId, '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0');
	assert.equal(event?.eventSourceUrl, `${ORIGIN}/products/dog-life-jacket`);
	assert.equal(event?.customData?.currency, 'USD');
	assert.equal(event?.customData?.value, '44.97');
});

test('every bridgeable name round-trips', () => {
	for (const name of BRIDGEABLE_EVENT_NAMES) {
		assert.equal(parseBrowserEvent({ eventName: name, eventId: 'abc' })?.eventName, name);
	}
});

test('Purchase is never bridged from the browser', () => {
	// The server copy comes from the payment webhook, against an order that was
	// actually paid. Anything else is revenue written by whoever can POST.
	assert.equal(parseBrowserEvent({ eventName: 'Purchase', eventId: 'purchase-CMP-1' }), null);
	assert.equal(isMetaEventName('Purchase'), true);
	assert.equal(isBridgeableEventName('Purchase'), false);
});

test('an event with no usable id is dropped', () => {
	// This is the whole point of the endpoint: an unlabelled server event cannot
	// dedupe against the browser one, so it double-counts. Better not sent.
	assert.equal(parseBrowserEvent({ eventName: 'PageView' }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'PageView', eventId: '' }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'PageView', eventId: '   ' }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'PageView', eventId: 'a b' }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'PageView', eventId: 'x'.repeat(121) }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'PageView', eventId: 42 }, ORIGIN), null);
});

test('unknown names and junk bodies are dropped', () => {
	assert.equal(parseBrowserEvent({ eventName: 'Lead', eventId: 'a' }, ORIGIN), null);
	assert.equal(parseBrowserEvent({ eventName: 'bundle_selected', eventId: 'a' }, ORIGIN), null);
	assert.equal(parseBrowserEvent(null, ORIGIN), null);
	assert.equal(parseBrowserEvent('PageView', ORIGIN), null);
	assert.equal(parseBrowserEvent([{ eventName: 'PageView', eventId: 'a' }], ORIGIN), null);
});

test('an event source URL from another origin is dropped, not reported', () => {
	const event = parseBrowserEvent(
		{ eventName: 'PageView', eventId: 'a', eventSourceUrl: 'https://someone-else.example/x' },
		ORIGIN
	);
	assert.equal(event?.eventName, 'PageView');
	assert.equal(event?.eventSourceUrl, undefined);
});

test('a malformed event source URL leaves the field off', () => {
	const event = parseBrowserEvent(
		{ eventName: 'PageView', eventId: 'a', eventSourceUrl: 'not a url' },
		ORIGIN
	);
	assert.equal(event?.eventSourceUrl, undefined);
});

test('custom data keeps only the fields Meta reads', () => {
	const data = sanitizeCustomData({
		currency: 'USD',
		value: 12.5,
		content_type: 'product',
		content_ids: ['CMP-LJ-BLU-M'],
		num_items: 2,
		utm_source: 'facebook',
		internal_margin: 0.42
	});

	assert.deepEqual(data, {
		currency: 'USD',
		value: '12.50',
		content_type: 'product',
		content_ids: ['CMP-LJ-BLU-M'],
		num_items: 2
	});
});

test('unusable values are omitted rather than reported as revenue', () => {
	assert.equal(sanitizeCustomData({ value: 'free' }), undefined);
	assert.equal(sanitizeCustomData({ value: -5 }), undefined);
	assert.equal(sanitizeCustomData({ value: Number.NaN }), undefined);
	assert.equal(sanitizeCustomData({ value: 1e9 }), undefined);
	assert.equal(sanitizeCustomData({ currency: 'dollars' }), undefined);
	assert.equal(sanitizeCustomData({ content_type: 'variant' }), undefined);
	assert.equal(sanitizeCustomData({}), undefined);
	assert.equal(sanitizeCustomData('nope'), undefined);
});

test('contents are normalised and lines without a sku are dropped', () => {
	const data = sanitizeCustomData({
		contents: [
			{ id: 'CMP-LJ-BLU-M', quantity: 3, item_price: 44.97 },
			{ id: '  CMP-LJ-RED-S  ' },
			{ quantity: 2 },
			{ id: 'CMP-LJ-BLK-L', quantity: 0.5 }
		]
	});

	assert.deepEqual(data?.contents, [
		{ id: 'CMP-LJ-BLU-M', quantity: 3, item_price: 44.97 },
		{ id: 'CMP-LJ-RED-S', quantity: 1 },
		{ id: 'CMP-LJ-BLK-L', quantity: 1 }
	]);
});

test('oversized lists are capped rather than forwarded whole', () => {
	const data = sanitizeCustomData({
		content_ids: Array.from({ length: 200 }, (_, i) => `sku-${i}`),
		contents: Array.from({ length: 200 }, (_, i) => ({ id: `sku-${i}`, quantity: 1 }))
	});

	assert.equal(data?.content_ids?.length, 50);
	assert.equal(data?.contents?.length, 50);
});
