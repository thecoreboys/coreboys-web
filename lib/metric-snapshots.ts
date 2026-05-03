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

type LatestRow = { member_slug: string; platform: string; count: string };

/** Latest count per (member_slug, platform) across the entire table. */
export async function getLatestCounts(): Promise<
  Map<string, number>
> {
  try {
    const res = await query<LatestRow>(
      `SELECT DISTINCT ON (member_slug, platform)
              member_slug, platform, count::text AS count
       FROM metric_snapshots
       ORDER BY member_slug, platform, snapshot_date DESC, taken_at DESC`,
    );
    const map = new Map<string, number>();
    for (const r of res.rows) {
      const n = Number(r.count);
      if (Number.isFinite(n) && n > 0) {
        map.set(`${r.member_slug}::${r.platform}`, n);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Subset of getLatestCounts() restricted to one slug — saves the
 * caller from filtering the full map themselves on a member page.
 */
export async function getLatestCountsForSlug(slug: string): Promise<
  Map<string, number>
> {
  try {
    const res = await query<LatestRow>(
      `SELECT DISTINCT ON (platform)
              member_slug, platform, count::text AS count
       FROM metric_snapshots
       WHERE member_slug = $1
       ORDER BY platform, snapshot_date DESC, taken_at DESC`,
      [slug],
    );
    const map = new Map<string, number>();
    for (const r of res.rows) {
      const n = Number(r.count);
      if (Number.isFinite(n) && n > 0) map.set(r.platform, n);
    }
    return map;
  } catch {
    return new Map();
  }
}
