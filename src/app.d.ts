import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			locale: Locale;
		}

		interface PageData {
			locale: Locale;
		}

		interface Platform {
			env?: {
				TURSO_DATABASE_URL?: string;
				TURSO_AUTH_TOKEN?: string;
			};
		}
	}
}

export {};
