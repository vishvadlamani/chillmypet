import type { Commerce, Store } from 'ecomwithai';
import type { Locale } from '$lib/i18n';
import type { MatchKeys } from 'ecomwithai/marketing';
import type { MetaBrowserIds } from '$lib/server/meta-browser-ids';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
			/** Tenant resolved from the Host header in hooks.server.ts. */
			store: Store;
			/** Per-store configuration from the store_settings table. */
			settings: Record<string, string>;
			/** Commerce modules already scoped to this store. */
			commerce: Commerce;
			stripePublishableKey: string;
			stripePaymentMethodConfiguration: string;
			/** `fbc`/`fbp` from Meta's Parameter Builder, already written back as cookies. */
			metaBrowserIds: MetaBrowserIds;
			/** Hashed name, email and address of a visitor who has ordered before; else empty. */
			metaMatchKeys: MatchKeys;
		}

		interface PageData {
			locale: Locale;
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
