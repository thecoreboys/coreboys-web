import { NextResponse } from "next/server";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { query } from "@/lib/db";
import { resolveYouTubeChannelId } from "@/lib/social-feed";
import { fetchUsersByLogin } from "@/lib/twitch";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { buildGuideNetworkRows } from "@/lib/watch/channels";
import { removeActiveTwitchArchiveDuplicates } from "@/lib/watch/guide-programs";
import type { WatchCatalog, WatchItem, WatchPlatform } from "@/lib/watch/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GuidePlatform = WatchPlatform;
type GuideStatus = "upcoming" | "replay" | "published" | "live";
type GuideContentType = "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";

type GuideProgram = {
  id: string;
  slug: string;
  login: string | null;
  title: string;
  game: string | null;
  startsAt: string;
  endsAt: string | null;
  status: GuideStatus;
  platform: GuidePlatform;
  thumbnailUrl: string | null;
  vodId: string | null;
  youtubeId: string | null;
  sourceUrl: string;
  contentType?: GuideContentType;
  orientation?: WatchItem["orientation"];
  durationSeconds?: number | null;
  watchItem?: WatchItem;
};

type SourceState = "ok" | "empty" | "unconfigured" | "error";

const REPLAY_DAYS = 14;
const SCHEDULE_DAYS = 7;
const TWITCH_SCHEDULE_TTL = 5 * 60;
const YOUTUBE_SCHEDULE_TTL = 4 * 60 * 60;

let twitchTokenCache: { value: string; expiresAt: number } | null = null;
let guideCatalogCache: { value: Promise<WatchCatalog | null>; expiresAt: number } | null = null;
const GUIDE_CATALOG_TTL_MS = 5 * 60_000;

function decodeTitle(raw: string): string {
  return raw
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function getTwitchAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const now = Date.now();
  if (twitchTokenCache && twitchTokenCache.expiresAt - 60_000 > now) {
    return twitchTokenCache.value;
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    twitchTokenCache = {
      value: json.access_token,
      expiresAt: now + Math.max(300, json.expires_in ?? 3600) * 1000,
    };
    return twitchTokenCache.value;
  } catch {
    return null;
  }
}

async function loadTwitchSchedules(
  users: Record<string, { id: string }>,
  serverNow: Date,
): Promise<{ items: GuideProgram[]; state: SourceState }> {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) {
    return { items: [], state: "unconfigured" };
  }

  const token = await getTwitchAppToken();
  if (!token) return { items: [], state: "error" };

  const clientId = process.env.TWITCH_CLIENT_ID;
  const queryStart = new Date(Math.floor(serverNow.getTime() / 900_000) * 900_000);
  const horizon = serverNow.getTime() + SCHEDULE_DAYS * 86_400_000;

  try {
    const lists = await Promise.all(
      MEMBERS.map(async (member) => {
        const user = users[member.twitchLogin.toLowerCase()];
        if (!user) return [] as GuideProgram[];

        const url = new URL("https://api.twitch.tv/helix/schedule");
        url.searchParams.set("broadcaster_id", user.id);
        url.searchParams.set("start_time", queryStart.toISOString());
        url.searchParams.set("first", "25");
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Client-Id": clientId!,
          },
          next: { revalidate: TWITCH_SCHEDULE_TTL },
        });
        if (!res.ok) return [] as GuideProgram[];

        const json = (await res.json()) as {
          data?: {
            segments?: Array<{
              id?: string;
              start_time?: string;
              end_time?: string;
              title?: string;
              canceled_until?: string | null;
              category?: { name?: string } | null;
            }>;
          };
        };

        return (json.data?.segments ?? []).flatMap((segment): GuideProgram[] => {
          if (!segment.id || !segment.start_time || segment.canceled_until) return [];
          const start = Date.parse(segment.start_time);
          const rawEnd = segment.end_time ? Date.parse(segment.end_time) : NaN;
          const end = Number.isFinite(rawEnd) ? rawEnd : start + 2 * 3_600_000;
          if (!Number.isFinite(start) || end <= serverNow.getTime() || start >= horizon) return [];
          return [{
            id: `twitch-schedule-${member.slug}-${segment.id}`,
            slug: member.slug,
            login: member.twitchLogin,
            title: segment.title?.trim() || `${member.stageName} on Twitch`,
            game: segment.category?.name?.trim() || null,
            startsAt: new Date(start).toISOString(),
            endsAt: new Date(end).toISOString(),
            status: "upcoming",
            platform: "twitch",
            thumbnailUrl: member.portrait,
            vodId: null,
            youtubeId: null,
            sourceUrl: `https://www.twitch.tv/${member.twitchLogin}/schedule`,
          }];
        });
      }),
    );
    const items = lists.flat();
    return { items, state: items.length ? "ok" : "empty" };
  } catch {
    return { items: [], state: "error" };
  }
}

type YoutubeTarget = {
  slug: string;
  label: string;
  ref: string;
  portrait: string;
};

function youtubeTargets(): YoutubeTarget[] {
  const targets: YoutubeTarget[] = [];
  const seen = new Set<string>();
  const groupRef = GROUP.socials.youtube.channelId || GROUP.socials.youtube.url || GROUP.socials.youtube.handle;
  if (groupRef) {
    seen.add(`house:${groupRef.toLowerCase()}`);
    targets.push({
      slug: "house",
      label: GROUP.name,
      ref: groupRef,
      portrait: "/group/thecoreboys.jpg",
    });
  }

  for (const member of MEMBERS) {
    for (const youtube of member.socials.filter((social) => social.platform === "youtube")) {
      const ref = youtube.url || youtube.handle;
      if (!ref) continue;
      const key = `${member.slug}:${ref.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({
        slug: member.slug,
        label: youtube.label?.trim()
          ? `${member.stageName} · ${youtube.label.trim()}`
          : member.stageName,
        ref,
        portrait: member.portrait,
      });
    }
  }
  return targets;
}

async function loadYoutubeUpcoming(
  serverNow: Date,
): Promise<{ items: GuideProgram[]; state: SourceState }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { items: [], state: "unconfigured" };

  try {
    const resolved = await Promise.all(
      youtubeTargets().map(async (target) => ({
        target,
        channelId: await resolveYouTubeChannelId(target.ref),
      })),
    );

    const searches = await Promise.all(
      resolved.map(async ({ target, channelId }) => {
        if (!channelId) return [] as Array<{ videoId: string; target: YoutubeTarget }>;
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("channelId", channelId);
        url.searchParams.set("eventType", "upcoming");
        url.searchParams.set("type", "video");
        url.searchParams.set("order", "date");
        url.searchParams.set("maxResults", "8");
        url.searchParams.set("key", key);
        const res = await fetch(url, { next: { revalidate: YOUTUBE_SCHEDULE_TTL } });
        if (!res.ok) return [] as Array<{ videoId: string; target: YoutubeTarget }>;
        const json = (await res.json()) as { items?: Array<{ id?: { videoId?: string } }> };
        return (json.items ?? []).flatMap((item) =>
          item.id?.videoId ? [{ videoId: item.id.videoId, target }] : [],
        );
      }),
    );

    const hits = searches.flat();
    const ids = Array.from(new Set(hits.map((hit) => hit.videoId)));
    if (ids.length === 0) return { items: [], state: "empty" };

    const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailUrl.searchParams.set("part", "snippet,liveStreamingDetails");
    detailUrl.searchParams.set("id", ids.slice(0, 50).join(","));
    detailUrl.searchParams.set("key", key);
    const detailRes = await fetch(detailUrl, { next: { revalidate: YOUTUBE_SCHEDULE_TTL } });
    if (!detailRes.ok) return { items: [], state: "error" };
    const details = (await detailRes.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { title?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string } } };
        liveStreamingDetails?: { scheduledStartTime?: string; scheduledEndTime?: string };
      }>;
    };

    const targetByVideo = new Map(hits.map((hit) => [hit.videoId, hit.target]));
    const horizon = serverNow.getTime() + SCHEDULE_DAYS * 86_400_000;
    const items = (details.items ?? []).flatMap((video): GuideProgram[] => {
      if (!video.id) return [];
      const target = targetByVideo.get(video.id);
      const startsAt = video.liveStreamingDetails?.scheduledStartTime;
      if (!target || !startsAt) return [];
      const start = Date.parse(startsAt);
      if (!Number.isFinite(start) || start < serverNow.getTime() - 15 * 60_000 || start >= horizon) return [];
      const scheduledEnd = video.liveStreamingDetails?.scheduledEndTime;
      const end = scheduledEnd && Number.isFinite(Date.parse(scheduledEnd))
        ? Date.parse(scheduledEnd)
        : start + 2 * 3_600_000;
      return [{
        id: `youtube-upcoming-${video.id}`,
        slug: target.slug,
        login: null,
        title: decodeTitle(video.snippet?.title?.trim() || `${target.label} on YouTube`),
        game: null,
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        status: "upcoming",
        platform: "youtube",
        thumbnailUrl:
          video.snippet?.thumbnails?.high?.url ??
          video.snippet?.thumbnails?.medium?.url ??
          `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
        vodId: null,
        youtubeId: video.id,
        sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
      }];
    });

    return { items, state: items.length ? "ok" : "empty" };
  } catch {
    return { items: [], state: "error" };
  }
}

async function loadRecordedSessions(): Promise<GuideProgram[]> {
  try {
    let res;
    try {
      res = await query<{
        id: string;
        member_slug: string;
        twitch_login: string;
        started_at: string;
        ended_at: string;
        title: string | null;
        game: string | null;
        thumbnail_url: string | null;
      }>(
        `SELECT id::text, member_slug, twitch_login,
                started_at::text, ended_at::text,
                title, game, thumbnail_url
           FROM stream_sessions
          WHERE ended_at IS NOT NULL
            AND started_at >= NOW() - INTERVAL '${REPLAY_DAYS} days'
          ORDER BY started_at DESC
          LIMIT 120`,
      );
    } catch {
      res = await query<{
        id: string;
        member_slug: string;
        twitch_login: string;
        started_at: string;
        ended_at: string;
        title: string | null;
        game: string | null;
        thumbnail_url: string | null;
      }>(
        `SELECT id::text, member_slug, twitch_login,
                started_at::text, ended_at::text,
                title, game, NULL::text AS thumbnail_url
           FROM stream_sessions
          WHERE ended_at IS NOT NULL
            AND started_at >= NOW() - INTERVAL '${REPLAY_DAYS} days'
          ORDER BY started_at DESC
          LIMIT 120`,
      );
    }

    return res.rows.map((row) => {
      const member = MEMBERS.find((candidate) => candidate.slug === row.member_slug);
      return {
        id: `session-${row.id}`,
        slug: row.member_slug,
        login: row.twitch_login,
        title: row.title?.trim() || "Past stream",
        game: row.game,
        startsAt: row.started_at,
        endsAt: row.ended_at,
        status: "replay" as const,
        platform: "twitch" as const,
        thumbnailUrl: row.thumbnail_url || member?.portrait || null,
        vodId: null,
        youtubeId: null,
        sourceUrl: `https://www.twitch.tv/${row.twitch_login}/videos`,
      };
    });
  } catch {
    return [];
  }
}

function mergeReplays(sessions: GuideProgram[], vods: GuideProgram[]): GuideProgram[] {
  const output = [...sessions];
  for (const vod of vods) {
    // Recorded stream sessions are Twitch-specific. YouTube live replays also
    // belong in the broadcast timeline, but must not be folded into a nearby
    // Twitch session from the same creator.
    if (vod.platform !== "twitch") {
      output.push(vod);
      continue;
    }
    const start = Date.parse(vod.startsAt);
    const match = output.find((session) => {
      if (session.slug !== vod.slug) return false;
      const sessionStart = Date.parse(session.startsAt);
      return Number.isFinite(start) && Number.isFinite(sessionStart) && Math.abs(start - sessionStart) < 20 * 60_000;
    });
    if (match) {
      // Use the catalog identity/transport so Guide and Watch share one
      // progress + My List key, while retaining the recorded session's richer
      // title/game and exact start/end timestamps.
      match.id = vod.id;
      match.vodId = vod.vodId;
      match.sourceUrl = vod.sourceUrl;
      match.thumbnailUrl = vod.thumbnailUrl || match.thumbnailUrl;
      match.watchItem = vod.watchItem;
      match.contentType = vod.contentType;
      match.orientation = vod.orientation;
      match.durationSeconds = vod.durationSeconds;
      if (!match.endsAt) match.endsAt = vod.endsAt;
    } else {
      output.push(vod);
    }
  }
  return output.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

function youtubeIdFromItem(item: WatchItem): string | null {
  const hrefMatch = /[?&]id=([0-9A-Za-z_-]{6,})/.exec(item.href);
  if (hrefMatch?.[1]) return decodeURIComponent(hrefMatch[1]);
  const sourceMatch = /(?:youtu\.be\/|[?&]v=|\/shorts\/)([0-9A-Za-z_-]{6,})/.exec(item.sourceUrl ?? "");
  return sourceMatch?.[1] ?? null;
}

function twitchVodIdFromItem(item: WatchItem): string | null {
  const source = /\/videos\/(\d+)/.exec(item.sourceUrl ?? "")?.[1];
  if (source) return source;
  const id = item.id.replace(/^(?:twitch-)?vod-/, "");
  return /^\d+$/.test(id) ? id : null;
}

function contentTypeFor(item: WatchItem): GuideContentType {
  if (item.kind === "live" || item.format === "live") return "live";
  if (item.kind === "vod") return "broadcast";
  if (item.format === "short") return "short";
  if (item.format === "photo") return "photo";
  if (item.kind === "clip") return "clip";
  if (item.platform === "youtube") return "video";
  return "post";
}

/**
 * Turn every dated catalog entry into a Guide event. The catalog already
 * aggregates the house account plus every configured member account, so this
 * keeps Guide and Watch on the same source-of-truth without teaching the Guide
 * route how each social API authenticates.
 */
function loadCatalogTimeline(catalog: WatchCatalog): GuideProgram[] {
  const candidates = catalog.all;
  const seen = new Set<string>();

  return candidates.flatMap((item): GuideProgram[] => {
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    const startsAt = item.live?.startedAt ?? item.publishedAt;
    if (!startsAt || !Number.isFinite(Date.parse(startsAt))) return [];
    const isLive = item.kind === "live" || item.format === "live";
    const isReplay = item.kind === "vod";
    const seconds = item.durationSeconds && item.durationSeconds > 0 ? item.durationSeconds : null;
    const startMs = Date.parse(startsAt);
    const sourceUrl = item.sourceUrl ?? item.href;

    return [{
      id: `catalog-${item.id}`,
      slug: item.memberSlug ?? "house",
      login: item.live?.login ?? (isReplay && item.platform === "twitch"
        ? MEMBERS.find((member) => member.slug === item.memberSlug)?.twitchLogin ?? null
        : null),
      title: item.title,
      game: item.subtitle ?? item.live?.game ?? null,
      startsAt,
      endsAt: seconds ? new Date(startMs + seconds * 1000).toISOString() : null,
      status: isLive ? "live" : isReplay ? "replay" : "published",
      platform: item.platform,
      thumbnailUrl: item.poster || item.backdrop || null,
      vodId: isReplay && item.platform === "twitch" ? twitchVodIdFromItem(item) : null,
      youtubeId: item.platform === "youtube" ? youtubeIdFromItem(item) : null,
      sourceUrl,
      contentType: contentTypeFor(item),
      orientation: item.orientation,
      durationSeconds: seconds,
      watchItem: item,
    }];
  });
}

function getGuideCatalog(): Promise<WatchCatalog | null> {
  const now = Date.now();
  if (guideCatalogCache && guideCatalogCache.expiresAt > now) return guideCatalogCache.value;
  const value = getWatchCatalog().catch(() => null);
  guideCatalogCache = { value, expiresAt: now + GUIDE_CATALOG_TTL_MS };
  return value;
}

export async function GET() {
  const serverNow = new Date();
  let users: Record<string, { id: string }> = {};
  try {
    users = await fetchUsersByLogin(MEMBERS.map((member) => member.twitchLogin));
  } catch {
    users = {};
  }

  const [twitchSchedule, youtubeUpcoming, sessions, catalog] = await Promise.all([
    loadTwitchSchedules(users, serverNow),
    loadYoutubeUpcoming(serverNow),
    loadRecordedSessions(),
    getGuideCatalog(),
  ]);

  const timeline = catalog ? loadCatalogTimeline(catalog) : [];
  const networks = catalog ? buildGuideNetworkRows(catalog) : [];
  const replays = mergeReplays(sessions, timeline.filter((program) => program.status === "replay"));
  const nonReplayTimeline = timeline.filter((program) => program.status !== "replay");
  const scheduledYoutubeIds = new Set(youtubeUpcoming.items.flatMap((item) => item.youtubeId ? [item.youtubeId] : []));
  const programs = removeActiveTwitchArchiveDuplicates(
    [...twitchSchedule.items, ...youtubeUpcoming.items, ...replays, ...nonReplayTimeline]
      .filter((program) => !(program.status === "published" && program.youtubeId && scheduledYoutubeIds.has(program.youtubeId))),
  ).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  return NextResponse.json(
    {
      serverNow: serverNow.toISOString(),
      horizonEnd: new Date(serverNow.getTime() + SCHEDULE_DAYS * 86_400_000).toISOString(),
      programs,
      networks,
      sources: {
        twitchSchedule: twitchSchedule.state,
        youtubeUpcoming: youtubeUpcoming.state,
        socialTimeline: timeline.length ? "ok" : "empty",
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
      },
    },
  );
}
