import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildEmailVerificationUrl,
  hashEmailVerificationToken,
  isEmailVerificationToken,
} from "../lib/email-verification-token";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("email verification tokens are strict, hashed, and URL-safe", () => {
  const token = "A".repeat(42) + "_";
  assert.equal(isEmailVerificationToken(token), true);
  assert.equal(isEmailVerificationToken(`${token}x`), false);
  assert.equal(isEmailVerificationToken("not a token"), false);
  assert.equal(
    hashEmailVerificationToken(token),
    createHash("sha256").update(token, "utf8").digest("hex"),
  );
  assert.equal(
    buildEmailVerificationUrl("https://thecoreboys.com/anything", token),
    `https://thecoreboys.com/api/auth/verify-email?token=${token}`,
  );
  assert.throws(() => hashEmailVerificationToken("bad"), /invalid_email_verification_token/);
});

test("fan email verification persists only a one-time hash and consumes it atomically", () => {
  const migration = read("scripts/migrations/041_fan_email_verification.sql");
  const service = read("lib/email-verification.ts");
  const signup = read("app/api/auth/signup/route.ts");
  const requestRoute = read("app/api/account/email-verification/route.ts");
  const verifyRoute = read("app/api/auth/verify-email/route.ts");
  const middleware = read("middleware.ts");
  const migrationRunner = read("scripts/apply-web-migrations.mjs");

  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/);
  assert.doesNotMatch(migration, /^\s*token\s+TEXT/im);
  assert.match(service, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(service, /hashEmailVerificationToken\(token\)/);
  assert.match(service, /UPDATE fan_email_verification_tokens[\s\S]*consumed_at=now\(\)[\s\S]*RETURNING user_id/);
  assert.match(service, /UPDATE fan_users SET email_verified=true/);
  assert.match(service, /EmailVerificationRateLimitError/);
  assert.match(requestRoute, /getCurrentFanUserId/);
  assert.match(requestRoute, /Retry-After/);
  assert.match(verifyRoute, /consumeEmailVerification/);
  assert.match(signup, /after\(async \(\) =>/);
  assert.match(middleware, /"\/api\/auth\/verify-email"/);
  assert.match(migrationRunner, /041_fan_email_verification\.sql/);
});
