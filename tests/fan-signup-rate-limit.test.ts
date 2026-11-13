import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

function load<T>(file: string, dependencies: Record<string, unknown>): T {
  const filename = resolve(file), requireNative = createRequire(filename);
  const module = { exports: {} };
  const javascript = transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  runInNewContext(javascript, {
    module, exports: module.exports, Request, Response, Headers, Date,
    console: { error() {} },
    require: (name: string) => name in dependencies ? dependencies[name] : requireNative(name),
  }, { filename });
  return module.exports as T;
}

const capacity = load<typeof import("../lib/fan-signup-rate-limit")>("lib/fan-signup-rate-limit.ts", { "server-only": {} });

const LIMIT = capacity.fanSignupHourlyLimit();

test("signup permits the last account under the hourly cap and rejects the next with the traffic message and retry delay", async () => {
  assert.ok(LIMIT >= 1_000, "launch cap must admit a real launch crowd");
  let count = LIMIT - 1;
  const client = { query: async (sql: string) => ({ rows: sql.includes("pg_advisory_xact_lock") ? [] : [{ created_count: count, retry_after_seconds: 600 }] }) } as unknown as PoolClient;
  await capacity.assertFanSignupCapacity(client);
  count = LIMIT;
  await assert.rejects(capacity.assertFanSignupCapacity(client), (error: unknown) => {
    assert.ok(error instanceof capacity.FanSignupRateLimitError);
    assert.equal(error.message, "Account creation is currently rate limited due to an influx of web traffic. Please try again later.");
    assert.equal(error.retryAfterSeconds, 600);
    return true;
  });
});

test("the capacity check takes no global lock that would serialize signups", async () => {
  const statements: string[] = [];
  const client = { query: async (sql: string) => { statements.push(sql); return { rows: [{ created_count: 0, retry_after_seconds: 1 }] }; } } as unknown as PoolClient;
  await capacity.assertFanSignupCapacity(client);
  assert.equal(statements.some((sql) => sql.includes("advisory")), false);
});

test("an unavailable shared database cannot grant a local signup allowance", async () => {
  const client = { query: async () => { throw new Error("database unavailable"); } } as unknown as PoolClient;
  await assert.rejects(capacity.assertFanSignupCapacity(client), /database unavailable/);
  const missing = { query: async () => ({ rows: [] }) } as unknown as PoolClient;
  await assert.rejects(capacity.assertFanSignupCapacity(missing), /Signup capacity is temporarily unavailable/);
});

function signupService(count: number, insertError?: unknown) {
  let insertions = 0, committed = false, rolledBack = false;
  const client = { query: async (sql: string, values?: unknown[]) => {
    if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (!sql.includes("INSERT INTO fan_users")) return { rows: [{ created_count: count, retry_after_seconds: 600 }] };
    insertions++;
    if (insertError) throw insertError;
    return { rows: [{ id: values?.[0], email: values?.[1], password_hash: values?.[2], display_name: values?.[3], email_verified: false, created_at: new Date() }] };
  } } as unknown as PoolClient;
  const service = load<typeof import("../lib/fan-users")>("lib/fan-users.ts", {
    bcryptjs: { hash: async () => "fixture-password-hash" },
    "@/lib/fan-signup-rate-limit": capacity,
    "@/lib/db": { withTransaction: async (run: (client: PoolClient) => Promise<unknown>) => {
      try { const value = await run(client); committed = true; return value; }
      catch (error) { rolledBack = true; throw error; }
    } },
  });
  return { service, stats: () => ({ insertions, committed, rolledBack }) };
}

const input = { email: "fan@example.com", password: "a-long-password", displayName: "Fan", consent: true as const };

test("account insert and capacity check share a transaction, with no insert when capacity is full", async () => {
  const available = signupService(LIMIT - 1);
  const user = await available.service.createFanUser(input);
  assert.equal(user.email, input.email);
  assert.equal("password_hash" in user, false);
  assert.deepEqual(available.stats(), { insertions: 1, committed: true, rolledBack: false });
  const full = signupService(LIMIT);
  await assert.rejects(full.service.createFanUser(input), capacity.FanSignupRateLimitError);
  assert.deepEqual(full.stats(), { insertions: 0, committed: false, rolledBack: true });
  const duplicate = signupService(LIMIT - 1, { code: "23505" });
  await assert.rejects(duplicate.service.createFanUser(input), duplicate.service.DuplicateEmailError);
  assert.equal(duplicate.stats().rolledBack, true);
});

test("signup returns HTTP 429 with a visible traffic error and does not create a session or send mail", async () => {
  const { service } = signupService(LIMIT);
  const route = load<typeof import("../app/api/auth/signup/route")>("app/api/auth/signup/route.ts", {
    "next/server": { NextResponse, after: () => assert.fail("No email on rejected signup") },
    "@/lib/fan-users": service,
    "@/lib/fan-signup-rate-limit": capacity,
    "@/lib/fan-auth-rate-limit": { limitFanAuth: async () => null },
    "@/lib/fan-auth": { signFanSessionToken: async () => assert.fail("No session on rejected signup") },
    "@/lib/email-verification": { getEmailVerificationReadiness: () => assert.fail("No email on rejected signup") },
  });
  const response = await route.POST(new Request("https://thecoreboys.com/api/auth/signup", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "600");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.deepEqual(await response.json(), { error: capacity.FAN_SIGNUP_RATE_LIMIT_MESSAGE, code: "signup_rate_limited" });
});
