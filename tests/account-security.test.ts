import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import type { PoolClient } from "pg";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { changePasswordSchema, displayNameSchema, passwordStrength, profileUpdateSchema, publicHandleSchema } from "../lib/account/account-schemas";
import { settingsHashFromHref, settingsSectionFromLocation } from "../lib/account/settings-navigation";

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

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("in-page settings links resolve to a hash; other destinations navigate normally", () => {
  const here = "https://thecoreboys.com/account/settings#profile";
  assert.equal(settingsHashFromHref("/account/settings#security", here), "security");
  assert.equal(settingsHashFromHref("#notifications", here), "notifications");
  assert.equal(settingsHashFromHref("https://thecoreboys.com/account/settings#privacy", here), "privacy");
  assert.equal(settingsHashFromHref("/account/settings/billing", here), null);
  assert.equal(settingsHashFromHref("/account/settings", here), null);
  assert.equal(settingsHashFromHref("https://evil.example/account/settings#profile", here), null);
  assert.equal(settingsHashFromHref("/dvr", here), null);
  assert.equal(settingsHashFromHref("/account/settings?oauth=ok#connections", here), null);
  assert.equal(settingsSectionFromLocation("#password", false), "security");
  assert.equal(settingsSectionFromLocation("#sessions", false), "security");
  assert.equal(settingsSectionFromLocation("#public-profile", false), "profile");
  assert.equal(settingsSectionFromLocation("#email", false), "profile");
  assert.equal(settingsSectionFromLocation("#data-export", false), "privacy");
});

test("the settings page intercepts same-page hash links that Next pushes without hashchange", () => {
  const page = read("app/account/settings/page.tsx");
  const layout = read("components/account/AccountSettingsLayout.tsx");
  assert.match(page, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(page, /settingsHashFromHref\(/);
  assert.match(page, /<AccountSecurity/);
  assert.match(layout, /id: "security"/);
  assert.doesNotMatch(read("components/account/NotificationSettings.tsx"), /href="\/account\/settings#notifications"/);
  assert.doesNotMatch(read("components/account/AccountDeletionCard.tsx"), /window\.confirm/);
  assert.doesNotMatch(read("components/account/AccountFanZone.tsx"), /rolling\s+out soon/);
  assert.doesNotMatch(read("app/account/digest/page.tsx"), /SMTP/);
  assert.match(read("app/account/digest/page.tsx"), /r\.ok \?/);
});

test("profile validation trims names and enforces handle rules on both client and server", () => {
  assert.equal(displayNameSchema.parse("  Core   Fan "), "Core Fan");
  assert.equal(displayNameSchema.safeParse("   ").success, false);
  assert.equal(displayNameSchema.safeParse("a".repeat(51)).success, false);
  assert.equal(displayNameSchema.safeParse("bad\u202ename").success, false);
  assert.equal(publicHandleSchema.parse("@Core-Fan"), "core-fan");
  assert.equal(publicHandleSchema.parse(""), null);
  assert.equal(publicHandleSchema.parse(null), null);
  assert.equal(publicHandleSchema.safeParse("admin").success, false);
  assert.equal(publicHandleSchema.safeParse("a").success, false);
  assert.equal(profileUpdateSchema.safeParse({}).success, false);
  assert.equal(profileUpdateSchema.safeParse({ displayName: "Fan", extra: true }).success, false);
  assert.deepEqual(profileUpdateSchema.parse({ publicHandle: "Fan-1" }), { publicHandle: "fan-1" });
});

test("password changes require the current password, a matching confirmation, and the reset rules", () => {
  const ok = { currentPassword: "old-password", newPassword: "a much longer phrase", confirmPassword: "a much longer phrase" };
  assert.equal(changePasswordSchema.safeParse(ok).success, true);
  assert.equal(changePasswordSchema.safeParse({ ...ok, currentPassword: "" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, confirmPassword: "different phrase" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: "short", confirmPassword: "short" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: "old-password", confirmPassword: "old-password" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ ...ok, newPassword: "é".repeat(40), confirmPassword: "é".repeat(40) }).success, false);
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("password123").score, 1);
  assert.ok(passwordStrength("Correct-Horse-9-Battery").score >= 3);
});

type FanAccountModule = typeof import("../lib/account/fan-account");

function fanAccount(state: { hash: string; version: number; resetTokensConsumed?: boolean }, compare: (plain: string, hash: string) => boolean) {
  const statements: string[] = [];
  const handle = async (sql: string, values: unknown[] = []) => {
    statements.push(sql);
    if (sql.startsWith("SELECT password_hash")) return { rows: [{ password_hash: state.hash }] };
    if (sql.includes("SET password_hash")) {
      if (values[1] !== state.hash) return { rows: [] };
      state.hash = String(values[2]);
      state.version += 1;
      return { rows: [{ session_version: state.version }] };
    }
    if (sql.includes("fan_password_reset_tokens")) { state.resetTokensConsumed = true; return { rows: [] }; }
    if (sql.includes("SET session_version")) { state.version += 1; return { rows: [{ session_version: state.version }] }; }
    return { rows: [] };
  };
  const module = load<FanAccountModule>("lib/account/fan-account.ts", {
    "server-only": {},
    bcryptjs: { compare: async (plain: string, hash: string) => compare(plain, hash), hash: async (plain: string) => `hash:${plain}` },
    "@/lib/db": {
      query: handle,
      withTransaction: async (run: (client: PoolClient) => Promise<unknown>) => run({ query: handle } as unknown as PoolClient),
    },
  });
  return { module, statements };
}

test("changing the password verifies the current one, bumps the session version, and voids reset links", async () => {
  const state = { hash: "hash:old-password", version: 3 };
  const { module } = fanAccount(state, (plain, hash) => hash === `hash:${plain}`);
  await assert.rejects(module.changeFanAccountPassword("u1", "wrong", "new-password-1"), (error: unknown) => {
    assert.ok(error instanceof module.AccountPasswordError);
    assert.equal(error.field, "currentPassword");
    return true;
  });
  assert.equal(state.version, 3);
  const version = await module.changeFanAccountPassword("u1", "old-password", "new-password-1");
  assert.equal(version, 4);
  assert.equal(state.hash, "hash:new-password-1");
  assert.equal((state as { resetTokensConsumed?: boolean }).resetTokensConsumed, true);
});

test("a concurrent password change is not silently overwritten", async () => {
  const state = { hash: "hash:old-password", version: 1 };
  const { module } = fanAccount(state, (plain, hash) => {
    const ok = hash === `hash:${plain}`;
    if (ok && plain === "old-password") state.hash = "hash:changed-elsewhere";
    return ok;
  });
  await assert.rejects(module.changeFanAccountPassword("u1", "old-password", "new-password-1"), /changed somewhere else/);
  assert.equal(state.hash, "hash:changed-elsewhere");
});

test("signing out other devices bumps the session version", async () => {
  const state = { hash: "x", version: 7 };
  const { module } = fanAccount(state, () => false);
  assert.equal(await module.revokeFanAccountSessions("u1"), 8);
});

test("account routes require the session, validate with zod, rate limit, and re-issue the current cookie", () => {
  const routes = ["app/api/account/profile/route.ts", "app/api/account/password/route.ts", "app/api/account/sessions/route.ts"].map(read);
  for (const route of routes) {
    assert.match(route, /requireAccountSession\(request\)/);
    assert.match(route, /limitAccountAction\(request, "(profile|password|sessions)"/);
    assert.match(route, /safeParse\(/);
  }
  assert.match(routes[1]!, /buildFanSessionCookie\(await signFanSessionToken\(session\.userId, version\)\)/);
  assert.match(routes[2]!, /buildFanSessionCookie\(await signFanSessionToken\(session\.userId, version\)\)/);
  const limiter = read("lib/account/account-rate-limit.ts");
  assert.match(limiter, /consumeAdminLoginRateLimit\(`fan-account-\$\{action\}:user:/);
});
