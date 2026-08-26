#!/usr/bin/env node
/**
 * One-shot admin seed. Upserts an admin with a bcrypt-hashed password.
 *
 * Run with environment variables:
 *   ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... pnpm db:seed-admin
 * Or explicit CLI values:
 *   pnpm db:seed-admin -- --email ... --password ...
 *
 * Reads DATABASE_URL and optional ADMIN_SEED_* values from .env.local.
 * Credentials are never printed or stored in this source file.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function loadEnv() {
  const file = resolve(REPO_ROOT, ".env.local");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}
loadEnv();

function cliValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

const ADMIN_EMAIL = (cliValue("--email") ?? process.env.ADMIN_SEED_EMAIL ?? "").toLowerCase();
const ADMIN_PASSWORD = cliValue("--password") ?? process.env.ADMIN_SEED_PASSWORD ?? "";

if (!/^\S+@\S+\.\S+$/.test(ADMIN_EMAIL) || ADMIN_PASSWORD.length < 12) {
  console.error(
    "Set ADMIN_SEED_EMAIL and an ADMIN_SEED_PASSWORD of at least 12 characters, or pass --email and --password.",
  );
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const u = new URL(url);
const pool = new Pool({
  host: u.hostname,
  port: u.port ? Number(u.port) : 5432,
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  database: u.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

(async () => {
  try {
    // The api repo owns the admin_users schema (soft-delete column,
    // partial unique index on email). Don't recreate; just upsert.
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const upd = await pool.query(
      `UPDATE admin_users
         SET password_hash = $2,
             roles = 'admin',
             role = 'admin',
             member_slug = NULL,
             display_name = COALESCE(NULLIF(display_name, ''), $1),
             deleted_at = NULL,
             updated_at = NOW()
       WHERE email = $1`,
      [ADMIN_EMAIL.toLowerCase(), hash],
    );
    if (upd.rowCount === 0) {
      await pool.query(
        `INSERT INTO admin_users
           (email, password_hash, roles, role, member_slug, display_name)
         VALUES ($1, $2, 'admin', 'admin', NULL, $1)`,
        [ADMIN_EMAIL.toLowerCase(), hash],
      );
    }

    const r = await pool.query(
      `SELECT email, role, member_slug, created_at, updated_at
       FROM admin_users WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    );
    console.log("active staff accounts:", r.rows);
    await pool.end();
    console.log("✓ admin seeded");
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
