#!/usr/bin/env node
/**
 * Apply this repo's additive analytics/staff migrations to DATABASE_URL.
 *
 * Usage: pnpm db:apply-web-migrations
 *
 * The script reads .env.local when the variables are not already present.
 * Each migration runs in its own transaction and is written to be idempotent.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "002_stream_sessions.sql",
  "013_twitchtracker_analytics.sql",
  "014_staff_accounts.sql",
  "015_core_passport.sql",
  "016_subscription_entitlements.sql",
  "017_postcard_product_systems.sql",
  "018_fanzone_communities.sql",
  "019_x_integration.sql",
  "020_x_feed_snapshots.sql",
  "021_postcard_draft_checkout.sql",
  "022_postcard_collectible_releases.sql",
  "023_watch_programming.sql",
  "024_face_presence.sql",
  "025_watch_progress_provenance.sql",
  "026_social_event_notifications.sql",
  "028_watch_together_rooms.sql",
  "029_member_gallery_curation.sql",
  "030_airtime_daily_archive.sql",
  "031_core_originals.sql",
  "032_x_feed_history.sql",
  "033_dj_cora_radio_cues.sql",
  "034_admin_mfa_and_ai_controls.sql",
];

function loadEnvLocal() {
  const envPath = resolve(repoRoot, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] != null) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function connectionConfig(url) {
  const parsed = new URL(url);
  const sslDisabled = parsed.searchParams.get("sslmode") === "disable";
  const isLocalDatabase = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: sslDisabled || isLocalDatabase ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  };
}

async function main() {
  loadEnvLocal();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const client = new Client(connectionConfig(databaseUrl));
  await client.connect();
  try {
    for (const name of migrations) {
      const sql = readFileSync(resolve(repoRoot, "scripts", "migrations", name), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
