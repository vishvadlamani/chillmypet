import type { Commerce, Store } from '@chillmypet/commerce';
import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
			/** Tenant resolved from the Host header in hooks.server.ts. */
			store: Store;
			/** Commerce modules already scoped to this store. */
			commerce: Commerce;
		}

		interface PageData {
			locale: Locale;
		}

		interface Platform {
			env?: {
				TURSO_DATABASE_URL?: string;
				TURSO_AUTH_TOKEN?: string;
				META_CAPI_ACCESS_TOKEN?: string;
				DEFAULT_STORE_ID?: string;
			};
			context?: {
				waitUntil(promise: Promise<unknown>): void;
			};
		}
	}
}

export {};
