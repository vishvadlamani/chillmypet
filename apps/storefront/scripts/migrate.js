import { applySchema, createDb } from 'ecomwithai';

const url = process.env.TURSO_DATABASE_URL ?? 'file:local.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createDb(authToken ? { url, authToken } : { url });
const applied = await applySchema(db);

console.log(`Applied ${applied} statements to ${url}`);
db.close();
