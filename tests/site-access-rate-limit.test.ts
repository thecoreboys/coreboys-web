import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

function load<T>(path: string, dependencies: Record<string, unknown>, production = true): T {
  const filename = resolve(path);
  const requireNative = createRequire(filename);
  const compiledModule = { exports: {} };
  const context = vm.createContext({ module: compiledModule, exports: compiledModule.exports, Date, Headers, Request, URL, console: { error() {} }, process: { env: { NODE_ENV: production ? "production" : "development" } }, require: (name: string) => name in dependencies ? dependencies[name] : requireNative(name) });
  context.global = context;
  vm.runInContext(ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context, { filename });
  return compiledModule.exports as T;
}

type Limit = { ok: boolean; retryAfterSeconds: number };
type Limiter = { consumeSiteAccessRateLimit(key: string): Promise<Limit>; siteAccessClientIp(headers: Headers): string };

test("the shared production limit allows six attempts and rejects subsequent concurrent attempts", async () => {
  let hits = 0;
  const limiter = load<Limiter>("lib/site-access-rate-limit.ts", { "server-only": {}, "@/lib/db": { query: async () => ({ rows: [{ hits: String(++hits), bucket_started_at: new Date().toISOString() }] }) } });
  const results = await Promise.all(Array.from({ length: 12 }, () => limiter.consumeSiteAccessRateLimit("visitor")));
  assert.equal(results.filter((result) => result.ok).length, 6);
  assert.ok(results.filter((result) => !result.ok).every((result) => result.retryAfterSeconds > 0 && result.retryAfterSeconds <= 900));
});

test("production does not fall back to per-replica allowances when the shared counter is unavailable", async () => {
  const dependencies = { "server-only": {}, "@/lib/db": { query: async () => { throw new Error("database unavailable"); } } };
  const production = load<Limiter>("lib/site-access-rate-limit.ts", dependencies);
  await assert.rejects(production.consumeSiteAccessRateLimit("visitor"), /site_access_rate_limit_unavailable/);
  const development = load<Limiter>("lib/site-access-rate-limit.ts", dependencies, false);
  for (let attempt = 0; attempt < 6; attempt++) assert.equal((await development.consumeSiteAccessRateLimit("visitor")).ok, true);
  assert.equal((await development.consumeSiteAccessRateLimit("visitor")).ok, false);
});

test("visitor identity uses the ingress peer rather than spoofable leading or Cloudflare headers", () => {
  const limiter = load<Limiter>("lib/site-access-rate-limit.ts", { "server-only": {}, "@/lib/db": {} });
  assert.equal(limiter.siteAccessClientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.4:443", "cf-connecting-ip": "198.51.100.2" })), "203.0.113.4");
  assert.equal(limiter.siteAccessClientIp(new Headers({ "x-forwarded-for": "198.51.100.1, [2001:db8::1]:443" })), "2001:db8::1");
  assert.equal(limiter.siteAccessClientIp(new Headers({ "cf-connecting-ip": "198.51.100.2" })), "unknown");
});

test("verification counts malformed requests and returns an enforced cooldown before checking the code", async () => {
  let attempts = 0;
  let checks = 0;
  const route = load<{ POST(request: Request): Promise<Response> }>("app/api/access/verify/route.ts", {
    "@/lib/site-access": { siteAccessGateEnabled: () => true, siteAccessSubjectKey: async () => "visitor", siteAccessCodeMatches: async () => { checks++; return false; } },
    "@/lib/site-access-rate-limit": { siteAccessClientIp: () => "203.0.113.4", consumeSiteAccessRateLimit: async () => ({ ok: ++attempts <= 6, retryAfterSeconds: 900 }) },
  });
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await route.POST(new Request("https://core.test/api/access/verify", { method: "POST", body: "{}" }));
    assert.equal(response.status, 401);
  }
  const blocked = await route.POST(new Request("https://core.test/api/access/verify", { method: "POST", body: JSON.stringify({ code: "123456" }) }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "900");
  assert.match(blocked.headers.get("Cache-Control")!, /no-store/);
  assert.equal(checks, 0, "blocked attempts never compare or accept the code");
});
