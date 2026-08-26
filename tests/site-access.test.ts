import assert from "node:assert/strict";
import test from "node:test";
import {
  createSiteAccessToken,
  siteAccessCodeMatches,
  siteAccessGateEnabled,
  verifySiteAccessToken,
} from "../lib/site-access";

const originalNodeEnv = process.env.NODE_ENV;
const originalCode = process.env.SITE_ACCESS_CODE;
const originalSecret = process.env.SITE_ACCESS_COOKIE_SECRET;

test.afterEach(() => {
  for (const [key, value] of Object.entries({
    NODE_ENV: originalNodeEnv,
    SITE_ACCESS_CODE: originalCode,
    SITE_ACCESS_COOKIE_SECRET: originalSecret,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("production gate requires both secrets", () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  delete process.env.SITE_ACCESS_CODE;
  delete process.env.SITE_ACCESS_COOKIE_SECRET;
  assert.equal(siteAccessGateEnabled(), false);
  process.env.SITE_ACCESS_CODE = "123456";
  assert.equal(siteAccessGateEnabled(), false);
  process.env.SITE_ACCESS_COOKIE_SECRET = "test-secret-that-is-long-enough";
  assert.equal(siteAccessGateEnabled(), true);
});

test("access code comparison accepts only the configured code", async () => {
  Object.assign(process.env, {
    SITE_ACCESS_CODE: "123456",
    SITE_ACCESS_COOKIE_SECRET: "test-secret-that-is-long-enough",
  });
  assert.equal(await siteAccessCodeMatches("123456"), true);
  assert.equal(await siteAccessCodeMatches("123457"), false);
  assert.equal(await siteAccessCodeMatches(""), false);
});

test("signed access tokens expire and reject tampering", async () => {
  Object.assign(process.env, {
    SITE_ACCESS_CODE: "123456",
    SITE_ACCESS_COOKIE_SECRET: "test-secret-that-is-long-enough",
  });
  const now = 1_800_000_000_000;
  const token = await createSiteAccessToken(now);
  assert.ok(token);
  assert.equal(await verifySiteAccessToken(token ?? undefined, now + 1_000), true);
  assert.equal(await verifySiteAccessToken(`${token}x`, now + 1_000), false);
  assert.equal(await verifySiteAccessToken(token ?? undefined, now + 8 * 24 * 60 * 60 * 1_000), false);
});
