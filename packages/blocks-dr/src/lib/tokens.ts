/**
 * Token substitution for authored copy.
 *
 * Manifest copy is written once and served for months, so anything inside it
 * that changes on its own has to be a token rather than a word. "August Sale"
 * typed as a literal is correct the day it ships and wrong every day of
 * September — the same failure as a hardcoded price, just slower to notice.
 *
 * Not a block. Blocks import it; manifests never see it.
 */

/**
 * Replace `{name}` tokens from `vars`. Unknown tokens are left alone rather than
 * blanked: `{month}` surviving into the page is a visible bug someone fixes,
 * where an empty string is a sentence quietly missing a word.
 */
export function fill(text: string, vars: Record<string, string | undefined>): string {
	return text.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

/**
 * Current month, full name. `locale` defaults to a fixed value rather than the
 * runtime's own so the server and the browser can't disagree about it — an
 * unpinned locale renders "August" on one and "августа" on the other, and Svelte
 * reports it as a hydration mismatch a long way from the cause.
 */
export function monthName(locale: string = 'en-US', at: Date = new Date()): string {
	return at.toLocaleString(locale, { month: 'long' });
}

export interface Span {
	text: string;
	strong: boolean;
}

/**
 * Split `**emphasised**` runs out of a line of copy.
 *
 * Bold inside a sentence is a real authoring need — "Perfect for **anxious &
 * senior pets**" is one bullet, not two fields. The alternative is letting
 * manifests carry HTML, which hands anyone who can publish a manifest a script
 * tag on the storefront. Returning spans keeps it text all the way to the DOM.
 *
 * Deliberately the only markup understood. A manifest is content, not a
 * document format, and every syntax added here is one a model can get subtly
 * wrong in a way nobody reviews.
 */
export function emphasize(text: string): Span[] {
	const out: Span[] = [];
	const re = /\*\*(.+?)\*\*/g;
	let at = 0;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		if (m.index > at) out.push({ text: text.slice(at, m.index), strong: false });
		out.push({ text: m[1], strong: true });
		at = m.index + m[0].length;
	}
	if (at < text.length) out.push({ text: text.slice(at), strong: false });
	return out;
}
