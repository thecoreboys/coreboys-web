import { createHash } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isEmailVerificationToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function hashEmailVerificationToken(value: string): string {
  if (!isEmailVerificationToken(value)) throw new Error("invalid_email_verification_token");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildEmailVerificationUrl(origin: string, token: string): string {
  if (!isEmailVerificationToken(token)) throw new Error("invalid_email_verification_token");
  const url = new URL("/api/auth/verify-email", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
