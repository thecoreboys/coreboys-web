/**
 * One-off, idempotent application of the fan-accounts schema
 * (coreboys-db/migrations/0007_fan_accounts.sql) against DATABASE_URL.
 *
 * Applied directly (not via the drizzle migrator) because this repo's
 * migrator journal is hand-managed and out of sync (0005/0006 unjournaled),
 * so replaying through it is risky. The DDL is CREATE TABLE IF NOT EXISTS —
 * additive only, safe to run more than once.
 *
 *   DATABASE_URL=... node scripts/apply-fan-accounts.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(
  __dirname,
  "../../coreboys-db/migrations/0007_fan_accounts.sql",
);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

// Strip drizzle breakpoint comments; run the whole file as one batch.
const sql = readFileSync(sqlPath, "utf8")
  .split("\n")
  .filter((l) => !l.trim().startsWith("-->"))
  .join("\n");

const u = new URL(url);
const client = new pg.Client({
  host: u.hostname,
  port: u.port ? Number(u.port) : 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name in ('fan_users','fan_oauth_connections')
     order by table_name`,
  );
  console.log("OK — tables present:", rows.map((r) => r.table_name).join(", "));
} catch (err) {
  console.error("apply failed:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
