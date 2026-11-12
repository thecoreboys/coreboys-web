import "server-only";
import type { PoolClient } from "pg";

export const FAN_SIGNUP_HOURLY_LIMIT = 100;
export const FAN_SIGNUP_RATE_LIMIT_MESSAGE = "Account creation is currently rate limited due to an influx of web traffic. Please try again later.";

export class FanSignupRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(FAN_SIGNUP_RATE_LIMIT_MESSAGE);
    this.name = "FanSignupRateLimitError";
  }
}

/** Hold the shared lock until the account insert commits or rolls back. */
export async function assertFanSignupCapacity(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["fan-signup:global-hourly"]);
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
    [FAN_SIGNUP_HOURLY_LIMIT],
  );
  const row = rows[0];
  if (!row || !Number.isFinite(row.created_count) || row.created_count < 0) {
    throw new Error("Signup capacity is temporarily unavailable");
  }
  if (row.created_count >= FAN_SIGNUP_HOURLY_LIMIT) {
    throw new FanSignupRateLimitError(Math.max(1, row.retry_after_seconds));
  }
}
