import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

test("fan sign-in and registration throttle by IP and account across requests and fail closed", async () => {
  const source = readFileSync("lib/fan-auth-rate-limit.ts", "utf8");
  const javascript = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const buckets = new Map<string, number>();
  let unavailable = false;
  const dependencies: Record<string, unknown> = {
    "server-only": {},
    "node:crypto": { createHash },
    "next/server": { NextResponse: { json: (body: unknown, init: { status: number }) => ({ body, status: init.status }) } },
    "@/lib/site-access-rate-limit": { siteAccessClientIp: () => "203.0.113.5" },
    "@/lib/admin-login-rate-limit": { consumeAdminLoginRateLimit: async (key: string, max: number) => {
      if (unavailable) throw new Error("unavailable");
      const hits = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, hits);
      return { ok: hits <= max, retryAfterSeconds: 900 };
    } },
  };
  const module = { exports: {} as Record<string, unknown> };
  const execute = runInNewContext(`(function(exports, require, module) { ${javascript}\n})`) as (exports: object, require: (id: string) => unknown, module: object) => void;
  execute(module.exports, (id) => dependencies[id], module);
  const limit = module.exports.limitFanAuth as (request: Request, action: "login" | "signup", email: string) => Promise<{ status: number } | null>;
  const request = new Request("https://thecoreboys.com/api/auth/login");
  for (let i = 0; i < 8; i++) assert.equal(await limit(request, "login", "fan@example.com"), null);
  assert.equal((await limit(request, "login", "fan@example.com"))?.status, 429);
  for (let i = 0; i < 4; i++) assert.equal(await limit(request, "signup", "fan@example.com"), null);
  assert.equal((await limit(request, "signup", "fan@example.com"))?.status, 429);
  unavailable = true;
  assert.equal((await limit(request, "signup", "other@example.com"))?.status, 503);
  assert.equal([...buckets.keys()].some((key) => key.includes("fan@example.com")), false);
});
