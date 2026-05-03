import { query } from "@/lib/db";

/**
 * Server-only readers for `metric_snapshots`. Render paths should call
 * these instead of hitting Social Fetch / Twitch directly — that way:
 *
 *   • The page is fast (single SQL round-trip, no third-party API on
 *     the hot path).
 *   • The user-visible counts only change when the snapshot cron runs,
 *     so we don't churn the UI mid-session.
 *   • If the upstream API is degraded (out of credits, throttled), the
 *     last successful snapshot is still served.
 *
 * The snapshot writer is `app/api/metrics/snapshot/route.ts`; trigger
 * it via the GitHub Actions cron-snapshot workflow or POST manually
 * with the METRICS_CRON_SECRET header.
 */

type LatestRow = {
  member_slug: string;
  platform: string;
  handle: string;
  count: string;
};

/**
 * Latest count per (slug, platform, handle). The map key is
 * `${platform}::${handle}` so members with multiple channels on the
 * same platform (Marlon has 3 YouTube channels) each get their own
 * row instead of being summed into one.
 */
export async function getLatestCountsForSlug(slug: string): Promise<
  Map<string, number>
> {
  try {
    const res = await query<LatestRow>(
      `SELECT DISTINCT ON (platform, handle)
              member_slug, platform, handle, count::text AS count
       FROM metric_snapshots
       WHERE member_slug = $1
       ORDER BY platform, handle, snapshot_date DESC, taken_at DESC`,
      [slug],
    );
    const map = new Map<string, number>();
    for (const r of res.rows) {
      const n = Number(r.count);
      if (Number.isFinite(n) && n > 0) {
        map.set(`${r.platform}::${r.handle ?? ""}`, n);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Sum of latest counts per platform for the given slug — collapses
 * multi-channel members into one number per platform. Used by the
 * home hero where the chip should read total YouTube subs across
 * every channel that member runs.
 */
export async function getLatestPlatformTotalsForSlug(slug: string): Promise<
  Map<string, number>
> {
  try {
    // Pull the latest row per (platform, handle) then sum by platform.
    const res = await query<LatestRow>(
      `SELECT DISTINCT ON (platform, handle)
              member_slug, platform, handle, count::text AS count
       FROM metric_snapshots
       WHERE member_slug = $1
       ORDER BY platform, handle, snapshot_date DESC, taken_at DESC`,
      [slug],
    );
    const totals = new Map<string, number>();
    for (const r of res.rows) {
      const n = Number(r.count);
      if (!Number.isFinite(n) || n <= 0) continue;
      totals.set(r.platform, (totals.get(r.platform) ?? 0) + n);
    }
    return totals;
  } catch {
    return new Map();
  }
}
