import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import {
  buildEmailVerificationUrl,
  hashEmailVerificationToken,
  isEmailVerificationToken,
} from "@/lib/email-verification-token";
import { getResendReadiness, sendEmailWithResend } from "@/lib/notifications/resend";

const TOKEN_TTL_MINUTES = 60;
const REQUEST_COOLDOWN_SECONDS = 60;

type UserRow = { email: string; email_verified: boolean };

export class EmailVerificationRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("email_verification_rate_limited");
    this.name = "EmailVerificationRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function publicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://thecoreboys.com";
  const url = new URL(configured);
  const localHttp = url.protocol === "http:"
    && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localHttp) throw new Error("invalid_public_site_origin");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export function getEmailVerificationReadiness() {
  const email = getResendReadiness();
  return {
    configured: email.configured,
    enabled: email.enabled,
    ready: email.readyToSend,
    missing: email.missing,
    invalid: email.invalid,
  };
}

export async function requestEmailVerification(userId: string): Promise<{
  state: "sent" | "already_verified";
}> {
  const user = (await query<UserRow>(
    `SELECT email,email_verified FROM fan_users WHERE id=$1 LIMIT 1`,
    [userId],
  )).rows[0];
  if (!user) throw new Error("fan_user_not_found");
  if (user.email_verified) return { state: "already_verified" };

  const recent = await query<{ retry_after_seconds: number }>(
    `SELECT GREATEST(1,CEIL(EXTRACT(EPOCH FROM (
              created_at + $2::integer * interval '1 second' - now()
            )))::integer) AS retry_after_seconds
       FROM fan_email_verification_tokens
      WHERE user_id=$1 AND consumed_at IS NULL
        AND created_at > now() - $2::integer * interval '1 second'
      ORDER BY created_at DESC LIMIT 1`,
    [userId, REQUEST_COOLDOWN_SECONDS],
  );
  if (recent.rows[0]) {
    throw new EmailVerificationRateLimitError(recent.rows[0].retry_after_seconds);
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  const id = randomUUID();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE fan_email_verification_tokens
          SET consumed_at=COALESCE(consumed_at,now())
        WHERE user_id=$1 AND consumed_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO fan_email_verification_tokens (id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,now()+$4::integer * interval '1 minute')`,
      [id, userId, tokenHash, TOKEN_TTL_MINUTES],
    );
  });

  const verificationUrl = buildEmailVerificationUrl(publicOrigin(), token);
  try {
    await sendEmailWithResend({
      to: user.email,
      subject: "Verify your email for CORE alerts",
      text: `Verify your email to turn on CORE notification emails. This link expires in ${TOKEN_TTL_MINUTES} minutes.\n\n${verificationUrl}`,
      html: `<h1>Verify your email</h1><p>Confirm <strong>${escapeHtml(user.email)}</strong> to turn on CORE notification emails.</p><p><a href="${escapeHtml(verificationUrl)}">Verify email</a></p><p>This one-time link expires in ${TOKEN_TTL_MINUTES} minutes.</p>`,
      idempotencyKey: `fan-email-verification-${id}`,
    });
  } catch (error) {
    // A provider/configuration failure must not consume the cooldown. The raw
    // token was never persisted, so removing its hash is safe and retryable.
    await query(`DELETE FROM fan_email_verification_tokens WHERE id=$1`, [id]).catch(() => undefined);
    throw error;
  }
  return { state: "sent" };
}

export async function consumeEmailVerification(token: string): Promise<boolean> {
  if (!isEmailVerificationToken(token)) return false;
  const tokenHash = hashEmailVerificationToken(token);
  return withTransaction(async (client) => {
    const claimed = await client.query<{ user_id: string }>(
      `UPDATE fan_email_verification_tokens
          SET consumed_at=now()
        WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now()
       RETURNING user_id`,
      [tokenHash],
    );
    const userId = claimed.rows[0]?.user_id;
    if (!userId) return false;
    await client.query(
      `UPDATE fan_users SET email_verified=true,updated_at=now() WHERE id=$1`,
      [userId],
    );
    await client.query(
      `UPDATE fan_email_verification_tokens
          SET consumed_at=COALESCE(consumed_at,now())
        WHERE user_id=$1`,
      [userId],
    );
    return true;
  });
}
