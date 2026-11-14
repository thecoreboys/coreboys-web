/** Actual campaign permissions regression in a disposable, loopback-only PostgreSQL container. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

// Never reads DATABASE_URL or .env files; this script cannot target a live database.
const container = `core-campaign-private-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
const migration = readFileSync(new URL("./migrations/063_clipping_campaigns.sql", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/campaigns/store.ts", import.meta.url), "utf8");
const runtimeSchema = store.match(/export const CAMPAIGN_SCHEMA_SQL = `([\s\S]*?)`;/)?.[1];
assert.ok(runtimeSchema, "The runtime initializer must expose its actual schema SQL");
const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
const staffId = randomUUID();
let client;
let started = false;

async function applySchema(sql) {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verifyPrivileges(role, expected) {
  for (const privilege of privileges) {
    const result = await client.query("SELECT has_table_privilege($1,'public.clipping_campaigns',$2) AS allowed", [role, privilege]);
    assert.equal(result.rows[0].allowed, expected, `${role} ${privilege}`);
  }
}

async function verifySecurity(apiRoles) {
  const result = await client.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid='public.clipping_campaigns'::regclass");
  assert.deepEqual(result.rows[0], { relrowsecurity: true, relforcerowsecurity: false, owner: "core_campaign_owner" });
  for (const role of apiRoles) {
    await verifyPrivileges(role, false);
    await client.query(`SET ROLE ${role}`);
    await assert.rejects(client.query("SELECT * FROM public.clipping_campaigns"), { code: "42501" });
    await assert.rejects(client.query("DELETE FROM public.clipping_campaigns"), { code: "42501" });
    await client.query("RESET ROLE");
  }
  for (const role of ["core_campaign_owner", "service_role"]) await verifyPrivileges(role, true);
}

async function verifyServerCrud(role) {
  await client.query(`SET ROLE ${role}`);
  const url = `https://example.invalid/campaign/${randomUUID()}`;
  const created = await client.query(`INSERT INTO clipping_campaigns
    (title,subject,campaign_url,image_url,reward_type,budget_cents,rate_cents,platforms,updated_by)
    VALUES('Test campaign','Test creator',$1,'/campaigns/test.webp','cpm',100000,100,ARRAY['youtube'],$2)
    RETURNING id,status,revision`, [url, staffId]);
  const id = created.rows[0].id;
  assert.equal(created.rows[0].status, "draft");
  assert.equal(created.rows[0].revision, 1);
  assert.equal((await client.query("SELECT * FROM clipping_campaigns WHERE id=$1", [id])).rowCount, 1);
  const published = await client.query(`UPDATE clipping_campaigns SET status='published',
    display_starts_at=now()-interval '1 hour', display_ends_at=now()+interval '1 day',
    revision=revision+1, updated_by=$2 WHERE id=$1 AND revision=1 RETURNING revision`, [id, staffId]);
  assert.equal(published.rows[0].revision, 2);
  assert.equal((await client.query(`SELECT id FROM clipping_campaigns WHERE id=$1 AND status='published'
    AND 'home'=ANY(placements) AND display_starts_at<=now() AND display_ends_at>now()`, [id])).rowCount, 1);
  assert.equal((await client.query("UPDATE clipping_campaigns SET title='Stale edit' WHERE id=$1 AND revision=1", [id])).rowCount, 0);
  assert.equal((await client.query("UPDATE clipping_campaigns SET status='archived' WHERE id=$1", [id])).rowCount, 1);
  assert.equal((await client.query("DELETE FROM clipping_campaigns WHERE id=$1", [id])).rowCount, 1);
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
  await client.query("CREATE ROLE core_campaign_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE public_only NOLOGIN NOSUPERUSER NOBYPASSRLS");
  await client.query("GRANT USAGE, CREATE ON SCHEMA public TO core_campaign_owner; SET ROLE core_campaign_owner");
  await client.query("CREATE TABLE admin_users(id uuid PRIMARY KEY)");
  await client.query("INSERT INTO admin_users(id) VALUES($1)", [staffId]);
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, service_role");

  // Migration and runtime initialization must both handle hosts without API roles.
  for (const sql of [migration, runtimeSchema]) {
    await client.query("SET ROLE core_campaign_owner");
    await applySchema(sql);
    await applySchema(sql);
    await client.query("RESET ROLE");
    await verifySecurity(["public_only"]);
    await verifyServerCrud("core_campaign_owner");
    await verifyServerCrud("service_role");
    await client.query("DROP TABLE clipping_campaigns");
  }

  await client.query("CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; SET ROLE core_campaign_owner");
  await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated");
  // Reproduce Supabase's broad default API grants for each independent create path.
  for (const sql of [migration, runtimeSchema]) {
    await client.query("SET ROLE core_campaign_owner");
    await applySchema(sql);
    await client.query("RESET ROLE");
    await verifySecurity(["public_only", "anon", "authenticated"]);
    await verifyServerCrud("core_campaign_owner");
    await verifyServerCrud("service_role");
    await client.query("DROP TABLE clipping_campaigns");
  }

  // Existing unsafe tables are repaired without replacing campaigns or their owner.
  await client.query("SET ROLE core_campaign_owner");
  await applySchema(runtimeSchema);
  const canary = await client.query(`INSERT INTO clipping_campaigns(title,subject,campaign_url,image_url,reward_type,budget_cents,rate_cents,platforms)
    VALUES('Preserved draft','Test','https://example.invalid/preserved','/x.webp','cpm',100,100,ARRAY['youtube']) RETURNING id`);
  await client.query("ALTER TABLE clipping_campaigns DISABLE ROW LEVEL SECURITY; GRANT ALL ON clipping_campaigns TO PUBLIC, anon, authenticated");
  await verifyPrivileges("anon", true);
  await applySchema(migration);
  await applySchema(runtimeSchema);
  assert.equal((await client.query("SELECT title FROM clipping_campaigns WHERE id=$1", [canary.rows[0].id])).rows[0].title, "Preserved draft");
  await client.query("RESET ROLE");
  await verifySecurity(["public_only", "anon", "authenticated"]);
  await verifyServerCrud("core_campaign_owner");
  await verifyServerCrud("service_role");

  // RLS remains a second barrier if a later deployment accidentally restores CRUD grants.
  await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON clipping_campaigns TO anon; SET ROLE anon");
  assert.equal((await client.query("SELECT * FROM clipping_campaigns")).rowCount, 0);
  assert.equal((await client.query("UPDATE clipping_campaigns SET title='Unauthorized' ")).rowCount, 0);
  assert.equal((await client.query("DELETE FROM clipping_campaigns")).rowCount, 0);
  await assert.rejects(client.query(`INSERT INTO clipping_campaigns(title,subject,campaign_url,image_url,reward_type,budget_cents,rate_cents,platforms)
    VALUES('Unauthorized','Test','https://example.invalid/unauthorized','/x.webp','cpm',100,100,ARRAY['youtube'])`), { code: "42501" });
  await client.query("RESET ROLE; SET ROLE core_campaign_owner");
  await applySchema(migration);
  assert.equal((await client.query("SELECT title FROM clipping_campaigns WHERE id=$1", [canary.rows[0].id])).rows[0].title, "Preserved draft");
  await client.query("RESET ROLE");
  await verifySecurity(["public_only", "anon", "authenticated"]);
  console.log("Campaign SQL access passed: both create paths, absent API roles, inherited/default grants, idempotent repair, RLS, and trusted CRUD/publishing.");
} finally {
  await client?.end().catch(() => {});
  if (started) docker("rm", "-f", container);
}
