import type { Commerce, Store } from 'ecomwithai';
import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
			/** Shared by the snippet's PageView and its Conversions API copy. */
			pageViewEventId: string;
			/** Tenant resolved from the Host header in hooks.server.ts. */
			store: Store;
			/** Per-store configuration from the store_settings table. */
			settings: Record<string, string>;
			/** Commerce modules already scoped to this store. */
			commerce: Commerce;
			stripePublishableKey: string;
			stripePaymentMethodConfiguration: string;
		}

		interface PageData {
			locale: Locale;
			pageViewEventId?: string;
		}

		interface Platform {
			env?: {
				TURSO_DATABASE_URL?: string;
				TURSO_AUTH_TOKEN?: string;
				META_CAPI_ACCESS_TOKEN?: string;
				STRIPE_SECRET_KEY?: string;
				STRIPE_WEBHOOK_SECRET?: string;
				DEFAULT_STORE_ID?: string;
			};
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
