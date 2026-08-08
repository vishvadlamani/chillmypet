import en from './locales/en.json';

export type Messages = typeof en;
export type Locale = string;

/**
 * Dot-paths of every string leaf in the message tree. Arrays (feature lists,
 * FAQ entries) resolve to `never` and drop out — read those off `pack()`
 * directly rather than through `t()`.
 */
type StringLeaves<T> = T extends readonly unknown[]
	? never
	: T extends object
		? {
				[K in Extract<keyof T, string>]: T[K] extends string
					? K
					: `${K}.${StringLeaves<T[K]>}`;
			}[Extract<keyof T, string>]
		: never;

export type MessageKey = StringLeaves<Messages>;

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

const modules = import.meta.glob<{ default: Messages }>('./locales/*.json', {
	eager: true
});

/**
 * Every language pack in `./locales`. Adding a language means adding one JSON
 * file here — nothing else in the app needs to change.
 */
const packs: Record<Locale, Messages> = {};
for (const [path, mod] of Object.entries(modules)) {
	const code = path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');
	packs[code] = mod.default;
}

export const defaultLocale: Locale = 'en';
export const locales: Locale[] = Object.keys(packs).sort();

export function isLocale(value: string | null | undefined): value is Locale {
	return typeof value === 'string' && value in packs;
}

export function pack(locale: Locale): Messages {
	return packs[locale] ?? packs[defaultLocale];
}

export function localeName(locale: Locale): string {
	return pack(locale).meta.name;
}

export function textDirection(locale: Locale): 'ltr' | 'rtl' {
	return pack(locale).meta.dir === 'rtl' ? 'rtl' : 'ltr';
}

function lookup(source: unknown, key: string): string | undefined {
	let node: unknown = source;
	for (const part of key.split('.')) {
		if (node === null || typeof node !== 'object') return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === 'string' ? node : undefined;
}

export function interpolate(template: string, params?: TranslateParams): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}

/**
 * Builds a translator bound to one locale. Create it per request or per
 * component render — never store one in module scope, since the server handles
 * many locales concurrently.
 */
export function createTranslator(locale: Locale): Translate {
	const active = pack(locale);
	const fallback = packs[defaultLocale];

	return (key, params) => {
		const template = lookup(active, key) ?? lookup(fallback, key);
		if (template === undefined) return key;
		return interpolate(template, params);
	};
}

/**
 * Picks the best supported locale from an `Accept-Language` header, falling
 * back to the store's configured default rather than a global one.
 */
export function negotiateLocale(
	header: string | null | undefined,
	fallback: Locale = defaultLocale
): Locale {
	const preferred = isLocale(fallback) ? fallback : defaultLocale;
	if (!header) return preferred;

	const ranked = header
		.split(',')
		.map((part) => {
			const [tag, ...rest] = part.trim().split(';');
			const q = rest.find((p) => p.trim().startsWith('q='));
			const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
			return { tag: tag.trim().toLowerCase(), q: Number.isNaN(quality) ? 0 : quality };
		})
		.filter((entry) => entry.tag && entry.q > 0)
		.sort((a, b) => b.q - a.q);

	for (const { tag } of ranked) {
		// Split before the guard: `isLocale` narrows `tag` away in the else branch.
		const base = tag.split('-')[0];
		if (isLocale(tag)) return tag;
		if (isLocale(base)) return base;
	}

	return preferred;
}

export function formatMoney(cents: number, locale: Locale, currency?: string): string {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency: currency ?? pack(locale).meta.currency
	}).format(cents / 100);
}
