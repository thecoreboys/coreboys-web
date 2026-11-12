#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import pg from "pg";
import ts from "typescript";

// No .env or production database access. Everything uses a disposable container.
const requireNative = createRequire(import.meta.url);
const container = `core-signup-test-${randomUUID()}`;
const password = randomBytes(24).toString("hex");
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 }).trim();
const pools = [];
let started = false;

function load(file, dependencies) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, Date,
    require: name => name in dependencies ? dependencies[name] : requireNative(name),
  }, { filename: file });
  return module.exports;
}

try {
  docker("run", "--rm", "-d", "--name", container, "-e", `POSTGRES_PASSWORD=${password}`, "-p", "127.0.0.1::5432", "postgres:16-alpine");
  started = true;
  const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
  assert.ok(port > 0);
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker("exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"); break; }
    catch (error) { if (attempt === 59) throw error; await new Promise(resolve => setTimeout(resolve, 300)); }
  }
  for (let replica = 0; replica < 2; replica++) pools.push(new pg.Pool({ host: "127.0.0.1", port, user: "postgres", database: "postgres", password, max: 4 }));
  const admin = pools[0];
  await admin.query(`CREATE TABLE fan_users (
    id text PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
    display_name text NOT NULL, consent boolean NOT NULL DEFAULT false, consent_at timestamptz,
    email_verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
  )`);
  const migration = readFileSync(new URL("./migrations/068_fan_signup_capacity.sql", import.meta.url), "utf8");
  await admin.query(migration);
  await admin.query(migration);
  const capacity = load("lib/fan-signup-rate-limit.ts", { "server-only": {} });
  const replicas = pools.map(pool => load("lib/fan-users.ts", {
    "@/lib/fan-signup-rate-limit": capacity,
    // This suite tests SQL transactions, not password hashing.
    bcryptjs: { hash: async () => "isolated-fixture-password-hash" },
    "@/lib/db": { withTransaction: async run => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await run(client);
        await client.query("COMMIT");
        return value;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    } },
  }));
  const input = number => ({ email: `fan-${number}@example.invalid`, password: "isolated-fixture-password", displayName: `Fan ${number}`, consent: true });
  const seed = async (count, age = "5 minutes") => admin.query(
    `INSERT INTO fan_users (id, email, password_hash, display_name, created_at)
     SELECT 'seed-' || n, 'seed-' || n || '@example.invalid', 'fixture', 'Seed', statement_timestamp() - $2::interval
     FROM generate_series(1, $1::int) n`, [count, age]);

  await seed(98);
  const burst = await Promise.allSettled(Array.from({ length: 30 }, (_, n) => replicas[n % replicas.length].createFanUser(input(n))));
  assert.equal(burst.filter(result => result.status === "fulfilled").length, 2);
  for (const result of burst.filter(result => result.status === "rejected")) {
    assert.ok(result.reason instanceof capacity.FanSignupRateLimitError);
    assert.equal(result.reason.message, capacity.FAN_SIGNUP_RATE_LIMIT_MESSAGE);
    assert.ok(result.reason.retryAfterSeconds > 0 && result.reason.retryAfterSeconds <= 3600);
  }
  assert.equal(Number((await admin.query("SELECT count(*) AS total FROM fan_users")).rows[0].total), 100);
  console.log("PASS concurrent registrations across replicas commit exactly the remaining hourly slots");

  await admin.query("TRUNCATE fan_users");
  await seed(98);
  await replicas[0].createFanUser(input("duplicate"));
  for (let n = 0; n < 5; n++) await assert.rejects(replicas[1].createFanUser(input("duplicate")), replicas[1].DuplicateEmailError);
  await replicas[1].createFanUser(input("final"));
  await assert.rejects(replicas[0].createFanUser(input("blocked")), capacity.FanSignupRateLimitError);
  assert.equal(Number((await admin.query("SELECT count(*) AS total FROM fan_users")).rows[0].total), 100);
  console.log("PASS failed and duplicate account creations do not consume signup capacity");

  await admin.query("TRUNCATE fan_users");
  await seed(100);
  await admin.query("UPDATE fan_users SET created_at = statement_timestamp() - interval '1 hour' WHERE id = 'seed-1'");
  await replicas[0].createFanUser(input("after-expiry"));
  await assert.rejects(replicas[1].createFanUser(input("after-expiry-blocked")), capacity.FanSignupRateLimitError);
  console.log("PASS expired registrations release capacity in the rolling one-hour window");

  await admin.query("TRUNCATE fan_users");
  await admin.query(`INSERT INTO fan_users (id, email, password_hash, display_name, created_at)
    SELECT 'seed-' || n, 'seed-' || n || '@example.invalid', 'fixture', 'Seed',
      statement_timestamp() - interval '30 minutes' + n * interval '5 seconds'
    FROM generate_series(1, 150) n`);
  await assert.rejects(replicas[0].createFanUser(input("existing-burst")), error => {
    assert.ok(error instanceof capacity.FanSignupRateLimitError);
    assert.ok(error.retryAfterSeconds > 2000 && error.retryAfterSeconds < 2100);
    return true;
  });
  console.log("PASS an existing traffic burst blocks signups until the 100th newest account expires");
} finally {
  await Promise.all(pools.map(pool => pool.end()));
  if (started) docker("rm", "-f", container);
}
