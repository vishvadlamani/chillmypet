export function money(cents: number, currency: string): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Stored as SQLite `datetime('now')`, which is UTC without a zone marker. */
export function when(value: string | null): string {
	if (!value) return '—';
	const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

const LABELS: Record<string, string> = {
	pending_payment: 'Awaiting payment',
	paid: 'Paid — to ship',
	cancelled: 'Cancelled',
	refunded: 'Refunded'
};

export function statusLabel(status: string): string {
	return LABELS[status] ?? status;
}
