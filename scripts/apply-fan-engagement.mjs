/**
 * Apply the 0008_fan_engagement migration idempotently to the managed
 * coreboys-db Postgres. Additive only (CREATE TABLE/INDEX IF NOT EXISTS) —
 * safe to re-run. Reads DATABASE_URL from coreboys-web/.env.local.
 *
 *   node scripts/apply-fan-engagement.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const dbRoot = join(webRoot, "..", "coreboys-db");

function loadEnvLocal() {
  const envPath = join(webRoot, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set (looked in coreboys-web/.env.local)");

  const u = new URL(url);
  const client = new pg.Client({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  });

  const sqlPath = join(dbRoot, "migrations", "0008_fan_engagement.sql");
  const sql = readFileSync(sqlPath, "utf8");
  // Split on the repo's statement-breakpoint convention; run each statement.
  const statements = sql
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--.*\n?)*$/.test(s));

  await client.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt);
    }
    // Confirm the tables exist.
    const expect = [
      "fan_points",
      "polls",
      "poll_options",
      "poll_votes",
      "clip_votes",
      "notification_prefs",
    ];
    const r = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [expect],
    );
    const found = new Set(r.rows.map((row) => row.table_name));
    const missing = expect.filter((t) => !found.has(t));
    console.log("Applied 0008_fan_engagement.");
    console.log("Tables present:", [...found].sort().join(", "));
    if (missing.length) {
      console.error("MISSING:", missing.join(", "));
      process.exitCode = 1;
    } else {
      console.log("OK — all 6 fan-engagement tables exist.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
