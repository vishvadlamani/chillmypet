import { createClient, type Client } from '@libsql/client';

export type { Client };

export type DatabaseConfig = {
	url: string;
	authToken?: string;
};

/**
 * Config is passed in rather than read from the environment: this package has
 * to run unchanged inside the storefront Worker today and inside a standalone
 * module Worker later, and those two read their environment differently.
 */
export function createDb(config: DatabaseConfig): Client {
	return createClient(
		config.authToken ? { url: config.url, authToken: config.authToken } : { url: config.url }
	);
}
