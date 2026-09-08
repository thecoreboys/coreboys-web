/** Create isolated local databases and apply the existing base schema. Never accepts a remote host. */
import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Local databases only');
const config = { host: url.hostname, port: Number(url.port) || 5432, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
const admin = new pg.Client({ ...config, database: 'postgres' });
await admin.connect();
for (const database of ['coreboys_dev', 'coreboys_media_ai']) {
  if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])).rowCount) await admin.query(`CREATE DATABASE ${database}`);
}
await admin.end();
const client = new pg.Client({ ...config, database: 'coreboys_dev' });
await client.connect();
const dir = resolve('../coreboys-db/migrations');
for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) {
  if ((await client.query("SELECT to_regclass('public.core_dev_base_migrations') AS ledger")).rows[0].ledger == null) await client.query('CREATE TABLE core_dev_base_migrations (name text PRIMARY KEY)');
  if ((await client.query('SELECT 1 FROM core_dev_base_migrations WHERE name=$1', [file])).rowCount) continue;
  await client.query('BEGIN');
  try {
    await client.query(readFileSync(resolve(dir, file), 'utf8'));
    await client.query('INSERT INTO core_dev_base_migrations VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`Applied local base ${file}`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
await client.end();
