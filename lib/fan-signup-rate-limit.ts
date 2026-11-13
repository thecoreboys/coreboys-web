import "server-only";
import type { PoolClient } from "pg";

/**
 * Global safety valve on new accounts per rolling hour. Per-IP and per-email
 * limits (lib/fan-auth-rate-limit.ts) stop individual abusers; this cap only
 * exists to shed a bot flood, so it must sit well above a real launch crowd.
 * Override with FAN_SIGNUP_HOURLY_LIMIT; 0 disables the global cap.
 */
export const DEFAULT_FAN_SIGNUP_HOURLY_LIMIT = 3_000;
export const FAN_SIGNUP_RATE_LIMIT_MESSAGE = "Account creation is currently rate limited due to an influx of web traffic. Please try again later.";

export function fanSignupHourlyLimit(): number {
  const raw = typeof process === "undefined" ? undefined : process.env.FAN_SIGNUP_HOURLY_LIMIT;
  if (raw == null || raw.trim() === "") return DEFAULT_FAN_SIGNUP_HOURLY_LIMIT;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : DEFAULT_FAN_SIGNUP_HOURLY_LIMIT;
}

export class FanSignupRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(FAN_SIGNUP_RATE_LIMIT_MESSAGE);
    this.name = "FanSignupRateLimitError";
  }
}

/**
 * Soft global cap checked inside the account insert transaction. This
 * deliberately takes no global lock: serializing every signup on one
 * advisory lock made each waiting request hold a pooled connection, which
 * starved logins and page queries during a burst. Concurrent signups can
 * overshoot the cap by a handful, which is fine for a flood valve.
 */
export async function assertFanSignupCapacity(client: PoolClient): Promise<void> {
  const limit = fanSignupHourlyLimit();
  if (limit === 0) return;
  const { rows } = await client.query<{ created_count: number; retry_after_seconds: number }>(
    `SELECT count(*)::int AS created_count,
       GREATEST(1, ceil(extract(epoch FROM (
         min(created_at) + interval '1 hour' - statement_timestamp()
       ))))::int AS retry_after_seconds
     FROM (
       SELECT created_at FROM fan_users
       WHERE created_at > statement_timestamp() - interval '1 hour'
       ORDER BY created_at DESC
       LIMIT $1
     ) recent`,
    [limit],
  );
  const row = rows[0];
  if (!row || !Number.isFinite(row.created_count) || row.created_count < 0) {
    throw new Error("Signup capacity is temporarily unavailable");
  }
  if (row.created_count >= limit) {
    throw new FanSignupRateLimitError(Math.max(1, row.retry_after_seconds));
  }
}
