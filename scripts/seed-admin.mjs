#!/usr/bin/env node
/**
 * One-shot admin seed. Creates the admin_users table if missing,
 * upserts mdcranberry@gmail.com with a bcrypt-hashed password.
 *
 * Run: pnpm db:seed-admin
 *
 * Reads DATABASE_URL from .env.local. The password is intentionally
 * hard-coded here for now since we have exactly one admin and the
 * value is documented in chat history; rotate by re-running this
 * script with a new constant.
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

const ADMIN_EMAIL = "mdcranberry@gmail.com";
const ADMIN_PASSWORD = "Password123!#1";

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
         SET password_hash = $2, updated_at = NOW()
       WHERE email = $1 AND deleted_at IS NULL`,
      [ADMIN_EMAIL.toLowerCase(), hash],
    );
    if (upd.rowCount === 0) {
      await pool.query(
        `INSERT INTO admin_users (email, password_hash, roles)
         VALUES ($1, $2, 'admin')`,
        [ADMIN_EMAIL.toLowerCase(), hash],
      );
    }

    const r = await pool.query(
      `SELECT email, roles, created_at, updated_at
       FROM admin_users WHERE deleted_at IS NULL
       ORDER BY created_at DESC`,
    );
    console.log("admin_users:", r.rows);
    await pool.end();
    console.log("✓ admin seeded");
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
