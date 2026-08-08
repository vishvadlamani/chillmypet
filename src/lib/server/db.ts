import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';

let client: Client | undefined;

/**
 * Turso in deployed environments, a local SQLite file otherwise, so the app
 * runs before any credentials exist. On Cloudflare the adapter populates
 * `$env/dynamic/private` from the Worker's secrets.
 */
export function db(): Client {
	if (client) return client;

	const url = env.TURSO_DATABASE_URL ?? 'file:local.db';
	const authToken = env.TURSO_AUTH_TOKEN;

	client = createClient(authToken ? { url, authToken } : { url });
	return client;
}
