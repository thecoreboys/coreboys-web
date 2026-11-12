import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import { NextRequest, NextResponse } from "next/server";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as validation from "../lib/auth/password-reset";
import type * as ResetService from "../lib/password-reset";
import type * as FanAuth from "../lib/fan-auth";
import type { ResendMailMessage } from "../lib/notifications/resend";

function load<T>(path: string, dependencies: Record<string, unknown>, env: Record<string, string | undefined> = process.env, globals: Record<string, unknown> = {}): T {
  const filename = resolve(path);
  const requireNative = createRequire(filename);
  const module = { exports: {} };
  const javascript = transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(javascript, {
    module, exports: module.exports, URL, URLSearchParams, Request, Response, Headers, TextEncoder, Buffer, Date,
    console: { error() {} }, process: { env }, window: {},
    require: (name: string) => name in dependencies ? dependencies[name] : requireNative(name),
    ...globals,
  }, { filename });
  return module.exports as T;
}

const tokens = load<typeof import("../lib/password-reset-token")>("lib/password-reset-token.ts", {
  "@/lib/auth/password-reset": validation,
});
const token = randomBytes(32).toString("base64url");
const routeDependencies = {
  "@/lib/auth/password-reset": validation,
  "@/lib/fan-auth-rate-limit": { limitFanAuth: async () => null },
};

function request(path: string, body: unknown): Request {
  return new Request(`https://thecoreboys.com${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("recovery validates email and passwords and prevents external return destinations", () => {
  assert.deepEqual(validation.forgotPasswordSchema.parse({ email: "  FAN@Example.com  ", next: "/watch?layout=grid" }), { email: "fan@example.com", next: "/watch?layout=grid" });
  assert.equal(validation.forgotPasswordSchema.safeParse({ email: "invalid" }).success, false);
  for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test"]) {
    assert.equal(validation.safeAuthNext(next), "/");
  }
  assert.equal(validation.resetPasswordSchema.safeParse({ token, password: "short" }).success, false);
  assert.equal(validation.resetPasswordSchema.safeParse({ token: "bad", password: "new-password" }).success, false);
  assert.equal(validation.newPasswordSchema.safeParse("a".repeat(73)).success, false);
  assert.equal(validation.newPasswordSchema.safeParse("🔑".repeat(19)).success, false);
  assert.equal(validation.newPasswordSchema.safeParse("a valid unique password").success, true);
});

test("reset URLs put the secret in a fragment and store only its SHA-256 hash", () => {
  const url = new URL(tokens.buildPasswordResetUrl("https://thecoreboys.com/untrusted/path", token, "/watch?layout=grid"));
  assert.equal(url.pathname, "/reset-password");
  assert.equal(url.hash, `#${token}`);
  assert.equal(url.searchParams.get("next"), "/watch?layout=grid");
  assert.equal(url.search.includes(token), false);
  assert.match(tokens.hashPasswordResetToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(tokens.hashPasswordResetToken(token), token);
  assert.throws(() => tokens.hashPasswordResetToken("bad"));
});

test("recovery pages suppress analytics even when the visitor has consented", () => {
  for (const path of ["/reset-password", "/watch"]) {
    let enabled: boolean | undefined;
    const analytics = load<{ GoogleAnalytics: () => unknown }>("components/analytics/GoogleAnalytics.tsx", {
      react: { useState: () => [true, (value: boolean) => { enabled = value; }], useEffect: (effect: () => void) => effect() },
      "next/navigation": { usePathname: () => path },
      "next/script": { __esModule: true, default: () => null },
      "@/lib/consent": { hasAnalyticsConsent: () => true, onConsentChange: () => () => {} },
    });
    const rendered = analytics.GoogleAnalytics();
    assert.equal(enabled, path !== "/reset-password");
    assert.equal(rendered === null, path === "/reset-password");
  }
});

test("recovery throttles email requests and token attempts in separate shared buckets", async () => {
  const buckets = new Map<string, number>();
  const limiter = load<{ limitFanAuth: (request: Request, action: string, identity: string) => Promise<Response | null> }>("lib/fan-auth-rate-limit.ts", {
    "server-only": {},
    "@/lib/site-access-rate-limit": { siteAccessClientIp: () => "203.0.113.5" },
    "@/lib/admin-login-rate-limit": { consumeAdminLoginRateLimit: async (key: string, max: number) => {
      const hits = (buckets.get(key) ?? 0) + 1;
      buckets.set(key, hits);
      return { ok: hits <= max, retryAfterSeconds: 900 };
    } },
  });
  for (let i = 0; i < 4; i++) assert.equal(await limiter.limitFanAuth(request("/forgot", {}), "forgot-password", "fan@example.com"), null);
  assert.equal((await limiter.limitFanAuth(request("/forgot", {}), "forgot-password", "fan@example.com"))?.status, 429);
  for (let i = 0; i < 10; i++) assert.equal(await limiter.limitFanAuth(request("/reset", {}), "reset-password", token), null);
  assert.equal((await limiter.limitFanAuth(request("/reset", {}), "reset-password", token))?.status, 429);
  assert.ok([...buckets.keys()].every((key) => !key.includes("fan@example.com") && !key.includes(token)));
});

type Element = { type: unknown; props: Record<string, unknown> & { children?: Element | Element[] } };

function resetFormHarness(fetch: typeof globalThis.fetch) {
  const hooks: unknown[] = [];
  let cursor = 0;
  let effect: () => (() => void) = () => () => {};
  let refreshes = 0;
  const listeners = new Map<string, () => void>();
  const location = { href: `https://thecoreboys.com/reset-password?next=%2Fwatch#${token}` };
  const window = {
    location,
    history: { state: {}, replaceState: (_state: unknown, _title: string, path: string) => { location.href = new URL(path, location.href).href; } },
    addEventListener: (event: string, listener: () => void) => listeners.set(event, listener),
    removeEventListener: (event: string) => listeners.delete(event),
  };
  const form = load<{ ResetPasswordForm: () => Element }>("components/auth/ResetPasswordForm.tsx", {
    react: {
      useRef: (value: unknown) => { const index = cursor++; return hooks[index] ??= { current: value }; },
      useState: (value: unknown) => {
        const index = cursor++;
        if (!(index in hooks)) hooks[index] = value;
        return [hooks[index], (next: unknown) => { hooks[index] = next; }];
      },
      useCallback: (callback: unknown) => callback,
      useEffect: (callback: () => (() => void)) => { effect = callback; },
    },
    "next/link": { __esModule: true, default: "a" },
    "lucide-react": { ArrowLeft: "span", CheckCircle2: "span", KeyRound: "span", Link2Off: "span" },
    "@untitledui/icons": { AlertCircle: "span" },
    "@/components/base/buttons/button": { Button: "button" },
    "@/components/base/input/input": { Input: "input" },
    "./AuthShell": { AuthShell: "section", authErrorClass: "error" },
    "@/components/providers/AuthProvider": { useAuth: () => ({ refresh: () => { refreshes++; } }) },
    "@/lib/auth/password-reset": validation,
  }, process.env, { window, fetch });
  return {
    render: () => { cursor = 0; return form.ResetPasswordForm(); },
    mount: () => effect(),
    openLink: (value: string) => { location.href = `https://thecoreboys.com/reset-password?next=%2Fwatch#${value}`; listeners.get("hashchange")?.(); },
    hooks, location, refreshes: () => refreshes,
  };
}

function elements(root: Element): Element[] {
  const children = root?.props?.children;
  return [root, ...(Array.isArray(children) ? children : children ? [children] : []).flatMap((child) => child && typeof child === "object" ? elements(child) : [])];
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("reset form removes secrets, preserves its token in Strict Mode, and accepts a new link in the same tab", async () => {
  const pending = new Map<string, (response: Response) => void>();
  const harness = resetFormHarness((_input, init) => new Promise<Response>((resolve) => {
    pending.set(JSON.parse(init!.body as string).token, resolve);
  }));
  harness.render();
  const cleanup = harness.mount();
  assert.equal(new URL(harness.location.href).hash, "");
  cleanup();
  harness.mount();
  assert.equal(pending.size, 1, "Strict Mode must not repeat validation or lose the captured token");
  const newerToken = randomBytes(32).toString("base64url");
  harness.openLink(newerToken);
  assert.equal(new URL(harness.location.href).hash, "");
  assert.equal(pending.size, 2);
  pending.get(newerToken)!(Response.json({ valid: true }));
  await settle();
  assert.equal(harness.hooks[3], "ready");
  pending.get(token)!(Response.json({ code: "invalid_reset_link" }, { status: 400 }));
  await settle();
  assert.equal(harness.hooks[3], "ready", "a late response for the old link cannot replace the new link state");
});

test("reset form requires matching passwords and presents success after completion", async () => {
  let resets = 0;
  const harness = resetFormHarness(async (input) => {
    if (String(input).endsWith("/validate")) return Response.json({ valid: true });
    resets++;
    return Response.json({ message: "Password updated" });
  });
  harness.render();
  harness.mount();
  await settle();
  const inputs = elements(harness.render()).filter((element) => element.type === "input");
  (inputs[0]!.props.onChange as (value: string) => void)("new-secure-password");
  (inputs[1]!.props.onChange as (value: string) => void)("different-password");
  const submit = () => (elements(harness.render()).find((element) => element.type === "form")!.props.onSubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault() {} });
  await submit();
  assert.equal(resets, 0);
  assert.match(harness.hooks[6] as string, /don’t match/);
  (inputs[1]!.props.onChange as (value: string) => void)("new-secure-password");
  await submit();
  assert.equal(resets, 1);
  assert.equal(harness.hooks[3], "success");
  assert.equal(harness.hooks[4], "");
  assert.equal(harness.hooks[5], "");
  assert.equal(harness.refreshes(), 1);
  const result = harness.render();
  assert.equal(result.props.title, "Password updated.");
  assert.ok(elements(result).some((element) => element.props.href === "/login?next=%2Fwatch"));
});

test("forgot password responds before looking up the account and never reveals account existence", async () => {
  const pending: Array<() => Promise<void>> = [];
  const lookups: string[] = [];
  const route = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/forgot-password/route.ts", {
    ...routeDependencies,
    "next/server": { NextResponse, after: (callback: () => Promise<void>) => pending.push(callback) },
    "@/lib/notifications/resend": { getResendReadiness: () => ({ readyToSend: true }) },
    "@/lib/password-reset": { requestPasswordReset: async (email: string) => { lookups.push(email); } },
  });
  for (const email of ["existing@example.com", "unknown@example.com"]) {
    const response = await route.POST(request("/api/auth/forgot-password", { email }));
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { message: validation.PASSWORD_RESET_REQUESTED });
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(lookups.length, 0);
  for (const callback of pending) await callback();
  assert.deepEqual(lookups, ["existing@example.com", "unknown@example.com"]);
  assert.equal((await route.POST(new Request("https://core.test", { method: "POST", body: "{" }))).status, 400);
});

test("forgot password reports a global mail outage and honors the shared throttle", async () => {
  const dependencies = {
    ...routeDependencies,
    "next/server": { NextResponse, after: () => assert.fail("must not schedule delivery") },
    "@/lib/notifications/resend": { getResendReadiness: () => ({ readyToSend: false }) },
    "@/lib/password-reset": {},
  };
  const outage = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/forgot-password/route.ts", dependencies);
  assert.equal((await outage.POST(request("/forgot", { email: "fan@example.com" }))).status, 503);
  const limited = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/forgot-password/route.ts", {
    ...dependencies,
    "@/lib/fan-auth-rate-limit": { limitFanAuth: async () => NextResponse.json({ error: "Too many attempts" }, { status: 429, headers: { "Retry-After": "900" } }) },
  });
  const response = await limited.POST(request("/forgot", { email: "fan@example.com" }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "900");
});

test("email recovery works without the preview cookie while other routes stay gated", async () => {
  const middleware = load<{ default: (request: NextRequest) => Promise<NextResponse> }>("middleware.ts", {
    "@/lib/admin-auth": { SESSION_COOKIE: "admin", verifySessionToken: async () => null },
    "@/lib/site-access": { SITE_ACCESS_COOKIE: "preview", siteAccessGateEnabled: () => true, verifySiteAccessToken: async () => null },
  });
  for (const path of ["/reset-password", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/auth/reset-password/validate"]) {
    const response = await middleware.default(new NextRequest(`https://thecoreboys.com${path}`));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
  for (const path of ["/api/auth/login", "/api/auth/reset-password/other", "/api/auth/forgot-password/other"]) {
    assert.equal((await middleware.default(new NextRequest(`https://thecoreboys.com${path}`))).status, 401);
  }
});

test("reset endpoints reject stale links, preserve failures, and clear the session on success", async () => {
  let valid = false;
  let consumed = 0;
  const dependencies = {
    ...routeDependencies,
    "@/lib/fan-auth": { buildClearFanSessionCookie: () => "coreboys-fan-session=; Max-Age=0; HttpOnly; Path=/" },
    "@/lib/password-reset": {
      consumePasswordReset: async () => { consumed++; return valid; },
      isPasswordResetTokenValid: async () => valid,
    },
  };
  const reset = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/reset-password/route.ts", dependencies);
  const check = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/reset-password/validate/route.ts", dependencies);
  const stale = await reset.POST(request("/reset", { token, password: "new-password" }));
  assert.equal(stale.status, 400);
  assert.equal((await stale.json()).code, "invalid_reset_link");
  valid = true;
  assert.equal((await check.POST(request("/check", { token }))).status, 200);
  assert.equal(consumed, 1, "link validation must not consume a token");
  const success = await reset.POST(request("/reset", { token, password: "new-password" }));
  assert.equal(success.status, 200);
  assert.match(success.headers.get("Set-Cookie")!, /Max-Age=0/);
  assert.equal(success.headers.get("Cache-Control"), "no-store");
  const unavailable = load<{ POST: (request: Request) => Promise<Response> }>("app/api/auth/reset-password/route.ts", {
    ...dependencies, "@/lib/password-reset": { consumePasswordReset: async () => { throw new Error("database unavailable"); } },
  });
  assert.equal((await unavailable.POST(request("/reset", { token, password: "new-password" }))).status, 503);
});

test("password reset works against PostgreSQL", { skip: !process.env.PASSWORD_RESET_TEST_DATABASE_URL }, async (t) => {
  const databaseUrl = new URL(process.env.PASSWORD_RESET_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "integration tests require an isolated local database");
  assert.match(databaseUrl.pathname, /^\/coreboys_password_reset_test$/);
  process.env.DATABASE_URL = databaseUrl.toString();
  const db = await import("../lib/db");
  const pool = db.getPool();
  const delivered: ResendMailMessage[] = [];
  let failDelivery = false;
  let sessionToken = "";
  const service = load<typeof ResetService>("lib/password-reset.ts", {
    "server-only": {}, "@/lib/db": db,
    "@/lib/auth/password-reset": validation,
    "@/lib/password-reset-token": tokens,
    "@/lib/email-verification": { publicOrigin: () => "https://thecoreboys.com" },
    "@/lib/notifications/resend": { sendEmailWithResend: async (message: ResendMailMessage) => {
      if (failDelivery) throw new Error("provider unavailable");
      delivered.push(message);
    } },
  });
  const auth = load<typeof FanAuth>("lib/fan-auth.ts", {
    jose, "@/lib/db": db,
    "next/headers": { cookies: async () => ({ get: () => ({ value: sessionToken }) }) },
  }, { FAN_SESSION_SECRET: "isolated-password-reset-session-secret" });

  async function seed() {
    await pool.query("TRUNCATE fan_users CASCADE");
    await pool.query(`INSERT INTO fan_users (id,email,password_hash,display_name) VALUES ('fan','fan@example.com',$1,'Fan')`, [await bcrypt.hash("old-password", 4)]);
    delivered.length = 0;
    failDelivery = false;
  }
  function emailedToken(): string {
    return new URL(delivered.at(-1)!.text.match(/https:\/\/\S+/)![0]).hash.slice(1);
  }

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS fan_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, email_verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const migration = readFileSync("scripts/migrations/067_fan_password_reset.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);

    await t.test("unknown addresses never receive mail or create tokens", async () => {
      await seed();
      await service.requestPasswordReset("unknown@example.com");
      assert.equal(delivered.length, 0);
      assert.equal((await pool.query("SELECT * FROM fan_password_reset_tokens")).rows.length, 0);
    });

    await t.test("concurrent requests produce one email and persist only a hash", async () => {
      await seed();
      await Promise.all(Array.from({ length: 6 }, () => service.requestPasswordReset("fan@example.com", "/watch")));
      assert.equal(delivered.length, 1);
      const rows = (await pool.query("SELECT * FROM fan_password_reset_tokens")).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].token_hash, tokens.hashPasswordResetToken(emailedToken()));
      assert.equal(JSON.stringify(rows).includes(emailedToken()), false);
      assert.equal(await service.isPasswordResetTokenValid(emailedToken()), true);
      assert.equal((await pool.query("SELECT session_version FROM fan_users")).rows[0].session_version, 0);
    });

    await t.test("a reset changes the password, revokes old sessions, and accepts a fresh login", async () => {
      await seed();
      // Sessions issued before recovery existed have no version claim.
      sessionToken = await new jose.SignJWT({}).setProtectedHeader({ alg: "HS256" })
        .setSubject("fan").setIssuedAt().setExpirationTime("1h")
        .sign(new TextEncoder().encode("isolated-password-reset-session-secret"));
      assert.equal(await auth.getCurrentFanUserId(), "fan");
      await service.requestPasswordReset("fan@example.com");
      assert.equal(await service.consumePasswordReset(emailedToken(), "a-new-secure-password"), true);
      const row = (await pool.query("SELECT * FROM fan_users WHERE id='fan'")).rows[0];
      assert.equal(await bcrypt.compare("a-new-secure-password", row.password_hash), true);
      assert.equal(await bcrypt.compare("old-password", row.password_hash), false);
      assert.equal(row.email_verified, false, "password recovery must not silently change email notification consent");
      assert.equal(row.session_version, 1);
      assert.equal(await auth.getCurrentFanUserId(), null);
      assert.equal(await service.consumePasswordReset(emailedToken(), "different-password"), false);
      sessionToken = await auth.signFanSessionToken("fan", row.session_version);
      assert.equal(await auth.getCurrentFanUserId(), "fan");
    });

    await t.test("simultaneous submissions consume the token exactly once", async () => {
      await seed();
      await service.requestPasswordReset("fan@example.com");
      const value = emailedToken();
      const results = await Promise.all([
        service.consumePasswordReset(value, "first-new-password"),
        service.consumePasswordReset(value, "second-new-password"),
      ]);
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal((await pool.query("SELECT session_version FROM fan_users")).rows[0].session_version, 1);
    });

    await t.test("expired links cannot change the password", async () => {
      await seed();
      await service.requestPasswordReset("fan@example.com");
      await pool.query("UPDATE fan_password_reset_tokens SET expires_at=now()-interval '1 minute'");
      assert.equal(await service.isPasswordResetTokenValid(emailedToken()), false);
      assert.equal(await service.consumePasswordReset(emailedToken(), "new-password"), false);
      assert.equal((await pool.query("SELECT session_version FROM fan_users")).rows[0].session_version, 0);
    });

    await t.test("a resend invalidates the old link and failed delivery can be retried", async () => {
      await seed();
      await service.requestPasswordReset("fan@example.com");
      const oldToken = emailedToken();
      await pool.query("UPDATE fan_password_reset_tokens SET created_at=now()-interval '61 seconds'");
      await service.requestPasswordReset("fan@example.com");
      assert.equal(await service.isPasswordResetTokenValid(oldToken), false);
      assert.equal(await service.isPasswordResetTokenValid(emailedToken()), true);
      await seed();
      failDelivery = true;
      await assert.rejects(service.requestPasswordReset("fan@example.com"), /provider unavailable/);
      assert.equal((await pool.query("SELECT * FROM fan_password_reset_tokens")).rows.length, 0);
      failDelivery = false;
      await service.requestPasswordReset("fan@example.com");
      assert.equal(delivered.length, 1);
    });

    await t.test("a failed password update rolls back token consumption", async () => {
      await seed();
      await service.requestPasswordReset("fan@example.com");
      const value = emailedToken();
      await pool.query("ALTER TABLE fan_users ADD CONSTRAINT test_reject_reset CHECK (session_version = 0)");
      try {
        await assert.rejects(service.consumePasswordReset(value, "new-password"));
        assert.equal(await service.isPasswordResetTokenValid(value), true);
      } finally {
        await pool.query("ALTER TABLE fan_users DROP CONSTRAINT test_reject_reset");
      }
    });
  } finally {
    await pool.end();
    global.__pgPool = undefined;
  }
});
