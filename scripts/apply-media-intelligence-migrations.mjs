#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = ["012_media_intelligence.sql", "027_deep_media_intelligence.sql"];

function loadEnvLocal() {
  const path = resolve(repoRoot, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] != null) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function connection(url) {
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname.toLowerCase());
  if (!loopback && process.env.MEDIA_INTELLIGENCE_ALLOW_REMOTE_DATABASE !== "true") {
    throw new Error("Refusing a remote media-intelligence database without MEDIA_INTELLIGENCE_ALLOW_REMOTE_DATABASE=true.");
  }
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: loopback ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  };
}

loadEnvLocal();
const configuredDatabaseUrl = process.env.MEDIA_INTELLIGENCE_DATABASE_URL?.trim();
const primaryDatabaseUrl = process.env.DATABASE_URL?.trim();
const isLoopback = (raw) => {
  try { return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(raw).hostname.toLowerCase()); }
  catch { return false; }
};
const databaseUrl = process.env.MEDIA_INTELLIGENCE_USE_PRIMARY_DATABASE === "true"
  && primaryDatabaseUrl
  && configuredDatabaseUrl
  && isLoopback(configuredDatabaseUrl)
  && !isLoopback(primaryDatabaseUrl)
  ? primaryDatabaseUrl
  : configuredDatabaseUrl || (process.env.MEDIA_INTELLIGENCE_USE_PRIMARY_DATABASE === "true" ? primaryDatabaseUrl : "");
if (!databaseUrl) throw new Error("MEDIA_INTELLIGENCE_DATABASE_URL is required, or set MEDIA_INTELLIGENCE_USE_PRIMARY_DATABASE=true with DATABASE_URL.");
const client = new Client(connection(databaseUrl));
await client.connect();
try {
  for (const name of migrations) {
    const sql = readFileSync(resolve(repoRoot, "scripts", "migrations", name), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      process.stdout.write(`Applied ${name}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.end();
}
