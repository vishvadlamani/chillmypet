export type ShippingMethod = 'standard' | 'express';

/** Shared so the checkout summary and the order total can't drift apart. */
export const SHIPPING_RATES: Record<ShippingMethod, number> = {
	standard: 0,
	express: 1200
};

export function isShippingMethod(value: unknown): value is ShippingMethod {
	return value === 'standard' || value === 'express';
}
