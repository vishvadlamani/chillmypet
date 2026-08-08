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
			this.lines = Array.isArray(parsed) ? parsed.filter(isLine) : [];
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

	clear() {
		// Idempotent on purpose: `persist()` reads `lines`, so an unconditional
		// write here would re-trigger any effect that calls clear() and loop.
		if (this.lines.length === 0) return;
		this.lines = [];
		this.persist();
	}
}

export const cart = new Cart();
