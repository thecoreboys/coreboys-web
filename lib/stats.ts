/**
 * Server-only stats aggregation. Powers `/press` and `/m/[slug]/numbers`.
 *
 * See `docs/STATS.md` for the contract — every cell on those pages
 * traces back to one of the exported functions in this file.
 *
 * Caching strategy: each fetcher is wrapped in Next's data cache via
 * fetch tags so the cms revalidates surgically. Failures are caught and
 * surfaced as `null` values with a `freshness` flag — the page never
 * blocks on a single failed source.
 */
import { z } from "zod";
import { MEMBERS, type Member } from "./members";
import { buildLiveResponse, type LiveResponse } from "./twitch";

async function getLiveSnapshot(): Promise<LiveResponse> {
  const logins = MEMBERS.map((m) => m.twitchLogin);
  return buildLiveResponse(logins);
}

export type Platform = "youtube" | "twitch" | "tiktok" | "instagram" | "x";

export type PlatformStat = {
  platform: Platform;
  handle: string;
  url: string;
  followers: number | null;
  views: number | null;
  recent: { window: "7d" | "30d"; value: number } | null;
  itemCount: number | null;
  fetchedAt: string;
  freshness: "live" | "stale" | "manual";
};

export type MemberStats = {
  slug: string;
  primaryPlatform: Platform;
  platforms: PlatformStat[];
  /** Single highlighted number for hero cells. */
  headline: { label: string; value: number; platform: Platform } | null;
};

export type OrgStats = {
  totals: {
    followersCumulative: number;
    viewsCumulative: number;
    monthlyViews: number | null;
    membersLive: number;
  };
  members: MemberStats[];
  fetchedAt: string;
};

const REVALIDATE_HOUR = 60 * 60;
const STATS_TAG = "stats";

// ── YouTube Data API v3 ─────────────────────────────────────────────────────

const YouTubeChannelStats = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ customUrl: z.string().optional() }).optional(),
        statistics: z.object({
          subscriberCount: z.string().optional(),
          viewCount: z.string().optional(),
          videoCount: z.string().optional(),
          hiddenSubscriberCount: z.boolean().optional(),
        }),
      }),
    )
    .default([]),
});

async function fetchYouTubeChannel(handle: string): Promise<{
  followers: number | null;
  views: number | null;
  videoCount: number | null;
} | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  // YouTube treats `@handle` lookups via `forHandle`; older accounts use
  // `forUsername`. Try forHandle first (covers everything since 2024).
  const params = new URLSearchParams({
    part: "snippet,statistics",
    forHandle: handle.replace(/^@/, ""),
    key,
  });
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
      next: { revalidate: REVALIDATE_HOUR, tags: [STATS_TAG] },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = YouTubeChannelStats.safeParse(json);
    if (!parsed.success) return null;
    const item = parsed.data.items[0];
    if (!item) return null;
    const subs = item.statistics.hiddenSubscriberCount
      ? null
      : Number(item.statistics.subscriberCount ?? "0") || null;
    return {
      followers: subs,
      views: Number(item.statistics.viewCount ?? "0") || null,
      videoCount: Number(item.statistics.videoCount ?? "0") || null,
    };
  } catch {
    return null;
  }
}

// ── Per-member resolver ─────────────────────────────────────────────────────

function extractYouTubeHandle(url: string): string | null {
  // Forms: https://www.youtube.com/@HandleName(/...) or /channel/UC...
  const m = url.match(/youtube\.com\/(@[^/?#]+)/i);
  return m?.[1] ?? null;
}

async function resolvePlatformForMember(
  member: Member,
  social: Member["socials"][number],
  liveByLogin: Map<string, { isLive: boolean; viewerCount: number | null }>,
): Promise<PlatformStat> {
  const now = new Date().toISOString();
  const baseUrl = social.url;

  if (social.platform === "youtube") {
    const handle = extractYouTubeHandle(baseUrl) ?? social.handle ?? "";
    if (handle) {
      const stats = await fetchYouTubeChannel(handle);
      if (stats) {
        return {
          platform: "youtube",
          handle,
          url: baseUrl,
          followers: stats.followers,
          views: stats.views,
          recent: null,
          itemCount: stats.videoCount,
          fetchedAt: now,
          freshness: "live",
        };
      }
    }
    return {
      platform: "youtube",
      handle: handle || "youtube",
      url: baseUrl,
      followers: null,
      views: null,
      recent: null,
      itemCount: null,
      fetchedAt: now,
      freshness: "stale",
    };
  }

  if (social.platform === "twitch") {
    const login = member.twitchLogin.toLowerCase();
    const liveEntry = liveByLogin.get(login);
    return {
      platform: "twitch",
      handle: `@${member.twitchLogin}`,
      url: baseUrl,
      followers: null, // Twitch follower count requires per-channel auth scope.
      views: null,
      recent: liveEntry?.isLive
        ? { window: "7d", value: liveEntry.viewerCount ?? 0 }
        : null,
      itemCount: null,
      fetchedAt: now,
      freshness: "live",
    };
  }

  // TikTok / Instagram / X / Snapchat — no public API consumer-grade stats.
  // Cms-managed manual values land here in Phase B.
  return {
    platform: social.platform as Platform,
    handle: social.handle ?? social.platform,
    url: baseUrl,
    followers: null,
    views: null,
    recent: null,
    itemCount: null,
    fetchedAt: now,
    freshness: "manual",
  };
}

function dedupeAndPickFirstPerPlatform(socials: Member["socials"]): Member["socials"] {
  const seen = new Set<string>();
  const out: Member["socials"] = [];
  for (const s of socials) {
    if (seen.has(s.platform)) continue;
    seen.add(s.platform);
    out.push(s);
  }
  return out;
}

// ── Public functions ───────────────────────────────────────────────────────

export async function getMemberStats(slug: string): Promise<MemberStats | null> {
  const member = MEMBERS.find((m) => m.slug === slug);
  if (!member) return null;

  const live = await getLiveSnapshot().catch(() => null);
  const liveByLogin = new Map(
    (live?.live ?? []).map((l) => [
      l.login.toLowerCase(),
      { isLive: l.isLive, viewerCount: l.viewerCount ?? null },
    ]),
  );

  const platforms: PlatformStat[] = [];
  for (const s of dedupeAndPickFirstPerPlatform(member.socials)) {
    platforms.push(await resolvePlatformForMember(member, s, liveByLogin));
  }

  // Pick the highlight headline — followers off YouTube if we have it,
  // else the live viewer count if streaming, else the first non-null
  // followers number.
  const yt = platforms.find((p) => p.platform === "youtube" && p.followers != null);
  const tw = platforms.find((p) => p.platform === "twitch" && p.recent?.value);
  const headline: MemberStats["headline"] = yt
    ? { label: "YouTube subscribers", value: yt.followers ?? 0, platform: "youtube" }
    : tw
      ? { label: "Watching now", value: tw.recent?.value ?? 0, platform: "twitch" }
      : null;

  return {
    slug: member.slug,
    primaryPlatform: yt ? "youtube" : "twitch",
    platforms,
    headline,
  };
}

export async function getOrgStats(): Promise<OrgStats> {
  const members = await Promise.all(MEMBERS.map((m) => getMemberStats(m.slug)));
  const concrete = members.filter((m): m is MemberStats => !!m);

  const totals = concrete.reduce(
    (acc, m) => {
      for (const p of m.platforms) {
        if (p.followers != null) acc.followersCumulative += p.followers;
        if (p.views != null) acc.viewsCumulative += p.views;
      }
      return acc;
    },
    { followersCumulative: 0, viewsCumulative: 0 } as Pick<
      OrgStats["totals"],
      "followersCumulative" | "viewsCumulative"
    >,
  );

  const live = await getLiveSnapshot().catch(() => null);
  const membersLive = (live?.live ?? []).filter((l) => l.isLive).length;

  return {
    totals: {
      ...totals,
      // monthlyViews is left null in Phase A — YouTube only exposes
      // cumulative views to non-OAuth callers. Phase B captures monthly
      // deltas via the cms.
      monthlyViews: null,
      membersLive,
    },
    members: concrete,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Format a count as "1.2M" / "342K" / "1,205". Used everywhere on the
 * press page so the visual treatment is consistent.
 */
export function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString("en-US");
}

export function platformLabel(p: Platform): string {
  switch (p) {
    case "youtube": return "YouTube";
    case "twitch": return "Twitch";
    case "tiktok": return "TikTok";
    case "instagram": return "Instagram";
    case "x": return "X";
  }
}
