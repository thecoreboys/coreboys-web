import { createHash } from "node:crypto";
import { passwordResetTokenSchema, safeAuthNext } from "@/lib/auth/password-reset";

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(passwordResetTokenSchema.parse(token), "utf8").digest("hex");
}

export function buildPasswordResetUrl(origin: string, token: string, next?: string): string {
  const url = new URL("/reset-password", origin);
  url.searchParams.set("next", safeAuthNext(next));
  // Fragments stay in the browser instead of appearing in server access logs,
  // analytics URLs or Referer headers. The reset form removes this on mount.
  url.hash = passwordResetTokenSchema.parse(token);
  return url.toString();
}
