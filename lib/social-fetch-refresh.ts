import "server-only";

import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";

export type SocialFetchRefreshLane = "profile_media" | "instagram_reels";

export type SocialFetchRefreshLease = {
  lane: SocialFetchRefreshLane;
  token: string;
};

const SUCCESS_TTL_SECONDS: Record<SocialFetchRefreshLane, number> = {
  // A two-hour lane keeps the full-site recurring budget comfortably below
  // the 10k default monthly cutoff while still delivering same-day alerts.
  profile_media: 2 * 60 * 60,
  instagram_reels: 2 * 60 * 60,
};

/** Atomically acquire a due lane across every Azure replica. */
export async function acquireSocialFetchRefreshLease(
  lane: SocialFetchRefreshLane,
): Promise<SocialFetchRefreshLease | null> {
  const token = randomUUID();
  const result = await query<{ lane: SocialFetchRefreshLane }>(
    `UPDATE social_fetch_media_refresh_state
        SET lease_token=$2::uuid,
            lease_until=now() + interval '15 minutes',
            last_started_at=now(),
            last_status='running',
            last_error=NULL,
            updated_at=now()
      WHERE lane=$1
        AND next_refresh_at <= now()
        AND (lease_until IS NULL OR lease_until <= now())
      RETURNING lane`,
    [lane, token],
  );
  return result.rows[0] ? { lane, token } : null;
}

/** Release an owned lane and schedule its next globally shared attempt. */
export async function completeSocialFetchRefreshLease(
  lease: SocialFetchRefreshLease,
  result: { ok: boolean; error?: string | null },
): Promise<boolean> {
  // A real upstream attempt (including an empty/402 result) is a completed
  // paid window and waits for the full lane TTL. Exceptions retry in ten
  // minutes after the lease is released.
  const delaySeconds = result.ok ? SUCCESS_TTL_SECONDS[lease.lane] : 10 * 60;
  const updated = await query(
    `UPDATE social_fetch_media_refresh_state
        SET next_refresh_at=now() + ($3::integer * interval '1 second'),
            lease_token=NULL,
            lease_until=NULL,
            last_completed_at=now(),
            last_status=$4,
            last_error=$5,
            updated_at=now()
      WHERE lane=$1 AND lease_token=$2::uuid`,
    [
      lease.lane,
      lease.token,
      delaySeconds,
      result.ok ? "complete" : "failed",
      result.error?.slice(0, 500) ?? null,
    ],
  );
  return (updated.rowCount ?? 0) > 0;
}
