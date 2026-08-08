import { readFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient(authToken ? { url, authToken } : { url });

// Schema lives with the domain modules, not the app that happens to consume them.
const schema = await readFile(
	new URL('../../../packages/commerce/src/db/schema.sql', import.meta.url),
	'utf8'
);

const statements = schema
	.split(';')
	.map((s) => s.trim())
	.filter((s) => s && !s.split('\n').every((line) => line.trim().startsWith('--')));

for (const statement of statements) {
	await client.execute(statement);
}

console.log(`Applied ${statements.length} statements to ${url}`);
client.close();
