import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";
import { publicOrigin } from "@/lib/email-verification";
import { sendEmailWithResend } from "@/lib/notifications/resend";
import {
  PASSWORD_RESET_COOLDOWN_SECONDS,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetTokenSchema,
  resetPasswordSchema,
} from "@/lib/auth/password-reset";
import { buildPasswordResetUrl, hashPasswordResetToken } from "@/lib/password-reset-token";

export async function requestPasswordReset(email: string, next = "/"): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const id = randomUUID();
  const resetUrl = buildPasswordResetUrl(publicOrigin(), token, next);
  const user = await withTransaction(async (client) => {
    // All issue/consume operations lock the account first. This serializes
    // simultaneous requests without token/account lock-order deadlocks.
    const user = (await client.query<{ id: string; email: string }>(
      `SELECT id,email FROM fan_users WHERE email=$1 FOR UPDATE`,
      [email],
    )).rows[0];
    if (!user) return null;
    const recent = await client.query(
      `SELECT id FROM fan_password_reset_tokens
        WHERE user_id=$1 AND consumed_at IS NULL
          AND created_at > now() - $2::integer * interval '1 second' LIMIT 1`,
      [user.id, PASSWORD_RESET_COOLDOWN_SECONDS],
    );
    if (recent.rows.length) return null;
    await client.query(
      `UPDATE fan_password_reset_tokens SET consumed_at=now()
        WHERE user_id=$1 AND consumed_at IS NULL`,
      [user.id],
    );
    await client.query(
      `INSERT INTO fan_password_reset_tokens (id,user_id,token_hash,expires_at)
       VALUES ($1,$2,$3,now()+$4::integer * interval '1 minute')`,
      [id, user.id, tokenHash, PASSWORD_RESET_TTL_MINUTES],
    );
    return user;
  });
  if (!user) return;

  try {
    await sendEmailWithResend({
      to: user.email,
      subject: "Reset your CORE password",
      text: `Reset your CORE password using the link below. It works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.\n\n${resetUrl}\n\nIf you didn’t request this, you can ignore this email. Your password has not changed.`,
      html: `<!doctype html><html lang="en"><body style="margin:0;background:#101014;color:#f4f4f5;font-family:Arial,sans-serif"><main style="max-width:480px;margin:0 auto;padding:40px 24px"><p style="color:#fda4af;font-size:12px;font-weight:700;letter-spacing:2px">CORE TV</p><h1 style="font-size:28px;letter-spacing:-1px">Reset your password.</h1><p style="color:#a1a1aa;line-height:1.6">Let’s get you back in. Use the button below to choose a new password.</p><p style="margin:28px 0"><a href="${resetUrl.replaceAll("&", "&amp;")}" style="display:inline-block;background:#e11d48;border-radius:10px;color:#fff;font-weight:700;padding:14px 22px;text-decoration:none">Reset password</a></p><p style="color:#a1a1aa;font-size:13px;line-height:1.6">This link works once and expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p><p style="color:#71717a;font-size:12px;line-height:1.6">If you didn’t request this, you can ignore this email. Your password has not changed.</p></main></body></html>`,
      idempotencyKey: `fan-password-reset-${id}`,
    });
  } catch (error) {
    // Failed delivery must leave the account immediately retryable.
    await query(`DELETE FROM fan_password_reset_tokens WHERE id=$1`, [id]).catch(() => undefined);
    throw error;
  }
}

export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  if (!passwordResetTokenSchema.safeParse(token).success) return false;
  const result = await query(
    `SELECT id FROM fan_password_reset_tokens
      WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now() LIMIT 1`,
    [hashPasswordResetToken(token)],
  );
  return result.rows.length > 0;
}

export async function consumePasswordReset(token: string, password: string): Promise<boolean> {
  const parsed = resetPasswordSchema.safeParse({ token, password });
  if (!parsed.success) return false;
  const tokenHash = hashPasswordResetToken(token);
  // Reject stale links before spending work on bcrypt; recheck under the lock.
  if (!await isPasswordResetTokenValid(token)) return false;
  const passwordHash = await bcrypt.hash(password, 10);
  return withTransaction(async (client) => {
    const user = (await client.query<{ id: string }>(
      `SELECT u.id FROM fan_users u
        JOIN fan_password_reset_tokens t ON t.user_id=u.id
        WHERE t.token_hash=$1 FOR UPDATE OF u`,
      [tokenHash],
    )).rows[0];
    if (!user) return false;
    const claimed = await client.query(
      `UPDATE fan_password_reset_tokens SET consumed_at=now()
        WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > clock_timestamp()
        RETURNING user_id`,
      [tokenHash],
    );
    if (!claimed.rows.length) return false;
    await client.query(
      `UPDATE fan_users SET password_hash=$2,session_version=session_version+1,updated_at=now()
        WHERE id=$1`,
      [user.id, passwordHash],
    );
    await client.query(
      `UPDATE fan_password_reset_tokens SET consumed_at=now()
        WHERE user_id=$1 AND consumed_at IS NULL`,
      [user.id],
    );
    return true;
  });
}
