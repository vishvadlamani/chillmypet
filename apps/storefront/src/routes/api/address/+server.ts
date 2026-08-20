import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Address lookup proxy.
 *
 * Sits in front of Google Places so the browser never sees the API key. A
 * Places key in client JS is a key anyone can lift and spend — Google bills per
 * request and the usual first sign is the invoice.
 *
 * It also normalises. Callers get our own field names (`address`, `city`,
 * `zip`, …), never Google's `addressComponents` shape, so replacing Places with
 * Mapbox or Loqate later is a change to this file and nothing else.
 *
 *   GET /api/address?q=7511+120           → { available, suggestions }
 *   GET /api/address?place=<id>           → { available, address }
 *
 * Both take `&session=` — Google bills an autocomplete session plus its one
 * details call as a single unit when they share a token, and as N separate
 * lookups when they don't.
 */

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS = 'https://places.googleapis.com/v1/places';

export interface AddressSuggestion {
	id: string;
	/** Bold part in the UI — "7511 120 Street". */
	main: string;
	/** Muted remainder — "Delta, BC, Canada". */
	secondary: string;
}

export interface ResolvedAddress {
	address: string;
	address2: string;
	city: string;
	state: string;
	zip: string;
	country: string;
}

/** Google returns components in any order; index them by type. */
function pick(components: GoogleComponent[], type: string, short = false): string {
	const hit = components.find((c) => c.types?.includes(type));
	return (short ? hit?.shortText : hit?.longText) ?? '';
}

interface GoogleComponent {
	longText?: string;
	shortText?: string;
	types?: string[];
}

function toAddress(components: GoogleComponent[]): ResolvedAddress {
	const streetNumber = pick(components, 'street_number');
	const route = pick(components, 'route');
	return {
		address: [streetNumber, route].filter(Boolean).join(' '),
		// `subpremise` is the flat/unit. Kept separate rather than appended to line
		// one, because carriers match on it and a merged string hides it.
		address2: pick(components, 'subpremise'),
		// `postal_town` is the UK's answer to a locality; without it London
		// addresses come back with no city at all.
		city: pick(components, 'locality') || pick(components, 'postal_town'),
		state: pick(components, 'administrative_area_level_1'),
		zip: pick(components, 'postal_code'),
		country: pick(components, 'country')
	};
}

/**
 * Dev fixture, used only when there's no key and only in `dev`. Shaped like the
 * real thing — same normalised fields, same two-call flow — so what's reviewed
 * locally is what ships once a key exists.
 */
const MOCK: Record<string, ResolvedAddress> = {
	'mock-1': {
		address: '7511 120 Street',
		address2: '',
		city: 'Delta',
		state: 'British Columbia',
		zip: 'V3W 3N1',
		country: 'Canada'
	},
	'mock-2': {
		address: '7511 120 Avenue Northwest',
		address2: '',
		city: 'Edmonton',
		state: 'Alberta',
		zip: 'T5B 0S4',
		country: 'Canada'
	},
	'mock-3': {
		address: '7511 120A Street',
		address2: 'Unit 4',
		city: 'Surrey',
		state: 'British Columbia',
		zip: 'V3W 1N4',
		country: 'Canada'
	}
};

function mock(url: URL): Response {
	const placeId = url.searchParams.get('place');
	if (placeId) return json({ available: true, address: MOCK[placeId] ?? MOCK['mock-1'] });

	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 3) return json({ available: true, suggestions: [] });

	return json({
		available: true,
		suggestions: Object.entries(MOCK).map(([id, a]) => ({
			id,
			main: a.address,
			secondary: [a.city, a.state, a.country].filter(Boolean).join(', ')
		}))
	});
}

export const GET: RequestHandler = async ({ url, fetch }) => {
	const key = env.GOOGLE_PLACES_API_KEY;

	// No key configured is a normal state, not an error: the field degrades to
	// plain manual entry and the form still takes an order. Returning 500 here
	// would break checkout on a missing env var.
	//
	// In local dev without a key we serve a small fixture instead, same as
	// /api/geo does — otherwise the expand-on-select behaviour is unreviewable
	// until someone buys a Places key.
	if (!key) return dev ? mock(url) : json({ available: false, suggestions: [] });

	const session = url.searchParams.get('session') ?? undefined;
	const placeId = url.searchParams.get('place');

	try {
		if (placeId) {
			const res = await fetch(
				`${DETAILS}/${encodeURIComponent(placeId)}?${new URLSearchParams({
					...(session ? { sessionToken: session } : {})
				})}`,
				{
					headers: {
						'X-Goog-Api-Key': key,
						// Required. Without a field mask the call is rejected outright,
						// and asking for everything is billed at a higher tier.
						'X-Goog-FieldMask': 'addressComponents'
					}
				}
			);
			if (!res.ok) return json({ available: false, address: null });
			const data = (await res.json()) as { addressComponents?: GoogleComponent[] };
			return json({ available: true, address: toAddress(data.addressComponents ?? []) });
		}

		const q = (url.searchParams.get('q') ?? '').trim();
		// Two characters is below the point where predictions mean anything, and
		// every keystroke is billable.
		if (q.length < 3) return json({ available: true, suggestions: [] });

		const countries = (url.searchParams.get('countries') ?? '')
			.split(',')
			.map((c) => c.trim().toLowerCase())
			.filter(Boolean);

		const res = await fetch(AUTOCOMPLETE, {
			method: 'POST',
			headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				input: q,
				...(session ? { sessionToken: session } : {}),
				...(countries.length ? { includedRegionCodes: countries } : {}),
				// Street addresses only — a checkout has no use for restaurants.
				includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route']
			})
		});
		if (!res.ok) return json({ available: false, suggestions: [] });

		const data = (await res.json()) as {
			suggestions?: Array<{
				placePrediction?: {
					placeId?: string;
					structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
					text?: { text?: string };
				};
			}>;
		};

		const suggestions: AddressSuggestion[] = (data.suggestions ?? [])
			.map((s) => s.placePrediction)
			.filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
			.map((p) => ({
				id: p.placeId!,
				main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
				secondary: p.structuredFormat?.secondaryText?.text ?? ''
			}));

		return json({ available: true, suggestions });
	} catch {
		// Upstream down, quota exhausted, network blip — the visitor types their
		// address by hand and the order still completes.
		return json({ available: false, suggestions: [] });
	}
};
