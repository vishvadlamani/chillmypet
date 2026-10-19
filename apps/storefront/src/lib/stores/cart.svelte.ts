import { browser } from '$app/environment';

export type CartLine = {
	variantId: number;
	slug: string;
	colour: string;
	size: string;
	quantity: number;
	unitPriceCents: number;
};

const KEY = 'chillmypet.cart.v1';
const MAX_PER_LINE = 10;

function isLine(value: unknown): value is CartLine {
	if (!value || typeof value !== 'object') return false;
	const line = value as Record<string, unknown>;
	return (
		Number.isInteger(line.variantId) &&
		typeof line.slug === 'string' &&
		typeof line.colour === 'string' &&
		typeof line.size === 'string' &&
		Number.isInteger(line.quantity) &&
		Number.isInteger(line.unitPriceCents)
	);
}

/**
 * One line per variant, quantities added together (and capped), the later
 * line's fields kept. A product renamed after it was carted left one browser
 * holding the same variant under its old slug and its new one; every list
 * keyed by variant (the cart drawer, the checkout) then threw Svelte's
 * `each_key_duplicate`, and the throw stopped every page's buttons and photos
 * responding (2026-10-19). A cart saved like that is mended on its next load.
 */
function merged(lines: CartLine[]): CartLine[] {
	const byVariant = new Map<number, CartLine>();
	for (const line of lines) {
		const seen = byVariant.get(line.variantId);
		byVariant.set(
			line.variantId,
			seen ? { ...line, quantity: Math.min(MAX_PER_LINE, seen.quantity + line.quantity) } : { ...line }
		);
	}
	return [...byVariant.values()];
}

/**
 * Browser-only cart. This is a module singleton, which on the server would be
 * shared between requests — safe here only because nothing mutates it during
 * SSR: it renders empty and hydrates from localStorage after mount.
 */
class Cart {
	lines = $state<CartLine[]>([]);
	hydrated = $state(false);

	get count(): number {
		return this.lines.reduce((sum, line) => sum + line.quantity, 0);
	}

	get subtotalCents(): number {
		return this.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
	}

	hydrate() {
		if (!browser || this.hydrated) return;
		try {
			const raw = localStorage.getItem(KEY);
			const parsed = raw ? JSON.parse(raw) : [];
			const saved = Array.isArray(parsed) ? parsed.filter(isLine) : [];
			this.lines = merged(saved);
			// Save the mended cart now, or the next page load mends it again.
			if (this.lines.length !== saved.length) this.persist();
		} catch {
			this.lines = [];
		}
		this.hydrated = true;
	}

	private persist() {
		if (!browser) return;
		try {
			localStorage.setItem(KEY, JSON.stringify(this.lines));
		} catch {
			// Private browsing or a full quota — the cart still works for this page view.
		}
	}

	add(line: Omit<CartLine, 'quantity'>, quantity = 1) {
		const existing = this.lines.find((l) => l.variantId === line.variantId);
		if (existing) {
			existing.quantity = Math.min(MAX_PER_LINE, existing.quantity + quantity);
		} else {
			this.lines.push({ ...line, quantity: Math.min(MAX_PER_LINE, quantity) });
		}
		this.persist();
	}

	setQuantity(variantId: number, quantity: number) {
		if (quantity <= 0) return this.remove(variantId);
		const line = this.lines.find((l) => l.variantId === variantId);
		if (line) {
			line.quantity = Math.min(MAX_PER_LINE, quantity);
			this.persist();
		}
	}

	remove(variantId: number) {
		this.lines = this.lines.filter((l) => l.variantId !== variantId);
		this.persist();
	}

	/**
	 * Swaps the whole cart for these lines — what a reminder email's "finish my
	 * order" link restores. Prices here are display-only like everywhere else in
	 * the cart; the checkout re-prices them against the database.
	 */
	replace(lines: CartLine[]) {
		this.lines = merged(
			lines
				.filter(isLine)
				.map((line) => ({ ...line, quantity: Math.max(1, Math.min(MAX_PER_LINE, line.quantity)) }))
		);
		this.hydrated = true;
		this.persist();
	}

	clear() {
		// Idempotent on purpose: `persist()` reads `lines`, so an unconditional
		// write here would re-trigger any effect that calls clear() and loop.
		if (this.lines.length === 0) return;
		this.lines = [];
		this.persist();
	}
}

export const cart = new Cart();
