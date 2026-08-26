import { query } from "@/lib/db";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";

/**
 * Server-only readers for `metric_snapshots`. Render paths use these as their
 * durable first source before any cached third-party fallback — that way:
 *
 *   • A successful snapshot is one fast SQL round-trip with no third-party
 *     dependency on the hot path.
 *   • Counts stay stable between snapshots; only missing channels use the
 *     cached API-only profile fallback.
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

function identityKey(slug: string, platform: string, handle: string): string {
  return `${slug}::${platform}::${handle}`;
}

function configuredIdentityKeysForSlug(slug: string): Set<string> | null {
  if (slug === "__group__") {
    return new Set(
      Object.entries(GROUP.socials).map(([platform, social]) =>
        identityKey(slug, platform, social.url),
      ),
    );
  }

  const member = MEMBERS.find((entry) => entry.slug === slug);
  if (!member) return null;
  return new Set(
    member.socials.map((social) =>
      identityKey(
        slug,
        social.platform,
        social.platform === "twitch" ? member.twitchLogin.toLowerCase() : social.url,
      ),
    ),
  );
}

function configuredOrgIdentityKeys(includeGroup: boolean): Set<string> {
  const keys = new Set<string>();
  for (const member of MEMBERS) {
    const memberKeys = configuredIdentityKeysForSlug(member.slug);
    memberKeys?.forEach((key) => keys.add(key));
  }
  if (includeGroup) {
    configuredIdentityKeysForSlug("__group__")?.forEach((key) => keys.add(key));
  }
  return keys;
}

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
    const configuredIdentities = configuredIdentityKeysForSlug(slug);
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
      const key = identityKey(slug, r.platform, r.handle ?? "");
      if (configuredIdentities ? !configuredIdentities.has(key) : !r.handle) continue;
      const n = Number(r.count);
      if (!Number.isFinite(n) || n <= 0) continue;
      totals.set(r.platform, (totals.get(r.platform) ?? 0) + n);
    }
    return totals;
  } catch {
    return new Map();
  }
}

export type OrgFollowerTotals = {
  /** Sum of the latest follower/sub count across every member channel +
   *  the group accounts, per platform. */
  byPlatform: Map<string, number>;
  /** Grand total across every platform. */
  total: number;
  /** True when at least one real (>0) count was found. Callers use this
   *  to decide between rendering a number and gracefully hiding the cell. */
  hasData: boolean;
};

/**
 * Org-wide follower totals straight from `metric_snapshots` — the latest
 * snapshot per currently configured (slug, platform, handle), summed. This is the data path
 * the home metrics sections should read from: it's populated by the
 * snapshot cron (API → scrape fallback) and survives the upstream APIs
 * being out of credits, where the live `getOrgStats()` (which needs
 * YOUTUBE_API_KEY) returns all zeros.
 *
 * Excludes the reserved `__group__` umbrella rows by default so member
 * channels and the group accounts aren't double-counted; pass
 * `includeGroup: true` to add the group accounts on top. Crew snapshots use
 * the reserved `__crew__:` prefix and are always excluded from org totals.
 */
export async function getOrgFollowerTotals(
  opts: { includeGroup?: boolean } = {},
): Promise<OrgFollowerTotals> {
  const { includeGroup = true } = opts;
  try {
    const configuredIdentities = configuredOrgIdentityKeys(includeGroup);
    const res = await query<LatestRow>(
      `SELECT DISTINCT ON (member_slug, platform, handle)
              member_slug, platform, handle, count::text AS count
       FROM metric_snapshots
       WHERE NOT starts_with(member_slug, '__crew__:')
       ${includeGroup ? "" : "AND member_slug <> '__group__'"}
       ORDER BY member_slug, platform, handle, snapshot_date DESC, taken_at DESC`,
    );
    const byPlatform = new Map<string, number>();
    let total = 0;
    for (const r of res.rows) {
      if (r.member_slug.startsWith("__crew__:")) continue;
      if (!includeGroup && r.member_slug === "__group__") continue;
      if (!configuredIdentities.has(identityKey(r.member_slug, r.platform, r.handle ?? ""))) continue;
      const n = Number(r.count);
      if (!Number.isFinite(n) || n <= 0) continue;
      byPlatform.set(r.platform, (byPlatform.get(r.platform) ?? 0) + n);
      total += n;
    }
    return { byPlatform, total, hasData: total > 0 };
  } catch {
    return { byPlatform: new Map(), total: 0, hasData: false };
  }
}
