/** Actual SQL permissions regression in a disposable, loopback-only PostgreSQL container. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// This script never reads DATABASE_URL or .env files and cannot target a live database.
const container = `core-content-private-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
const migration = (name) => readFileSync(new URL(`./migrations/${name}`, import.meta.url), "utf8");
const tables = [
  "content_tombstones", "content_removal_cleanup", "social_fetch_request_cache",
  "content_verification_schedule", "content_verification_checks",
  "twitch_content_verification_schedule", "twitch_content_verification_checks",
  "x_content_verification_schedule", "x_content_verification_checks",
];
const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
let client;
let started = false;

async function applyPrivateAccess() {
  await client.query("BEGIN");
  try {
    await client.query(migration("062_content_private_access.sql"));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function expectRolePrivileges(role, expected) {
  for (const table of tables) {
    for (const privilege of privileges) {
      const result = await client.query("SELECT has_table_privilege($1, $2, $3) AS allowed", [role, `public.${table}`, privilege]);
      assert.equal(result.rows[0].allowed, expected, `${role} ${privilege} ${table}`);
    }
  }
}

async function verifyServerCrud(role) {
  await client.query(`SET ROLE ${role}`);
  const key = `youtube:id:${role}`;
  await client.query("INSERT INTO content_tombstones(content_key,provider,reason,evidence,observed_at) VALUES($1,'youtube','deleted','provider_webhook',now())", [key]);
  assert.equal((await client.query("SELECT * FROM content_tombstones WHERE content_key=$1", [key])).rowCount, 1);
  assert.equal((await client.query("UPDATE content_tombstones SET reason='private' WHERE content_key=$1", [key])).rowCount, 1);
  assert.equal((await client.query("DELETE FROM content_tombstones WHERE content_key=$1", [key])).rowCount, 1);
  const cacheKey = "a".repeat(64);
  await client.query("INSERT INTO social_fetch_request_cache(request_key,payload) VALUES($1,'{}')", [cacheKey]);
  assert.equal((await client.query("UPDATE social_fetch_request_cache SET lease_until=now() + interval '2 minutes' WHERE request_key=$1 RETURNING payload", [cacheKey])).rowCount, 1);
  await client.query("DELETE FROM social_fetch_request_cache WHERE request_key=$1", [cacheKey]);
  assert.equal((await client.query("UPDATE content_verification_schedule SET next_run_at=now() WHERE lane='social_objects' RETURNING lane")).rowCount, 1);
  for (const table of tables) await client.query(`SELECT * FROM public.${table}`);
  await client.query("RESET ROLE");
}

try {
  docker("run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:16-alpine");
  started = true;
  const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
  assert.ok(Number.isInteger(port) && port > 0);
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); break; }
    catch (error) { if (attempt === 59) throw error; await new Promise((done) => setTimeout(done, 300)); }
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    client = new pg.Client({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password, connectionTimeoutMillis: 1000 });
    try { await client.connect(); break; }
    catch (error) {
      await client.end().catch(() => {});
      if (attempt === 29) throw error;
      await new Promise((done) => setTimeout(done, 300));
    }
  }
  await client.query("CREATE ROLE core_content_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE public_only NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await client.query("GRANT USAGE, CREATE ON SCHEMA public TO core_content_owner; SET ROLE core_content_owner");
  await client.query("CREATE TABLE social_content_events(canonical_id text PRIMARY KEY)");
  for (const name of [
    "056_content_tombstones.sql", "057_social_fetch_request_cache.sql", "058_content_verification.sql",
    "059_twitch_content_verification.sql", "060_x_content_verification.sql",
  ]) await client.query(migration(name));

  // PostgreSQL installations without Supabase API roles must also migrate safely.
  for (const table of tables) await client.query(`GRANT ALL ON TABLE public.${table} TO PUBLIC, service_role`);
  await applyPrivateAccess();
  await expectRolePrivileges("public_only", false);
  await client.query("RESET ROLE; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; SET ROLE core_content_owner");
  for (const table of tables) await client.query(`GRANT ALL ON TABLE public.${table} TO PUBLIC, anon, authenticated`);
  await expectRolePrivileges("anon", true);
  await expectRolePrivileges("authenticated", true);
  await applyPrivateAccess();
  await applyPrivateAccess();
  await client.query("RESET ROLE");

  for (const role of ["anon", "authenticated", "public_only"]) {
    await expectRolePrivileges(role, false);
    await client.query(`SET ROLE ${role}`);
    for (const table of tables) await assert.rejects(client.query(`SELECT * FROM public.${table}`), { code: "42501" });
    await client.query("RESET ROLE");
  }
  const security = await client.query("SELECT relname,relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY relname", [tables.map((table) => `public.${table}`)]);
  assert.equal(security.rowCount, tables.length);
  for (const row of security.rows) {
    assert.equal(row.relrowsecurity, true, row.relname);
    assert.equal(row.relforcerowsecurity, false, row.relname);
    assert.equal(row.owner, "core_content_owner", row.relname);
  }
  await expectRolePrivileges("core_content_owner", true);
  await expectRolePrivileges("service_role", true);
  await verifyServerCrud("core_content_owner");
  await verifyServerCrud("service_role");

  // RLS remains a second barrier if a future default grant accidentally returns.
  await client.query("GRANT SELECT, INSERT ON content_verification_schedule TO public_only; SET ROLE public_only");
  assert.equal((await client.query("SELECT * FROM content_verification_schedule")).rowCount, 0);
  await assert.rejects(client.query("INSERT INTO content_verification_schedule(lane) VALUES('social_objects')"), { code: "42501" });
  await client.query("RESET ROLE; SET ROLE core_content_owner");
  await applyPrivateAccess();
  await client.query("RESET ROLE");
  // A similarly named unrelated table is deliberately outside this migration.
  assert.equal((await client.query("SELECT relrowsecurity FROM pg_class WHERE oid='social_content_events'::regclass")).rows[0].relrowsecurity, false);
  console.log(JSON.stringify({ ok: true, tables: tables.length, deniedRoles: ["PUBLIC", "anon", "authenticated"], retainedRoles: ["owner", "service_role"], idempotent: true, localOnly: true }));
} finally {
  if (client) await client.end().catch(() => {});
  if (started) docker("rm", "-f", container);
}
