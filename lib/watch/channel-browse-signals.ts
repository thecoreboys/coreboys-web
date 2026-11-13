import "server-only";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { MEMBERS_BY_SLUG } from "@/lib/members";
import { cachedPublicData } from "@/lib/server-cache";
import { fetchChannelVideos, fetchUserIdsByLogin, type TwitchVod } from "@/lib/twitch";
import {
  BROWSE_WINDOW_MS,
  browseItemKey,
  type BrowseFilters,
  type BrowseSignals,
} from "./channel-browse";
import { itemToPlayable } from "./playable";
import type { WatchItem } from "./types";

/** Each provider lookup is bounded; a slow provider leaves items unranked. */
const SIGNAL_TIMEOUT_MS = 2_500;
/** YouTube videos.list costs one quota unit per 50 IDs; cap a single request. */
const YOUTUBE_STATS_MAX_IDS = 1_000;

function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), SIGNAL_TIMEOUT_MS); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

function youtubeId(item: WatchItem): string | null {
  if (item.platform !== "youtube") return null;
  if (item.id.startsWith("yt-")) return item.id.slice(3);
  const match = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([0-9A-Za-z_-]{6,})/.exec(item.sourceUrl ?? item.href);
  return match?.[1] ?? null;
}

type YoutubeStats = Record<string, { views?: number; likes?: number }>;

function isYoutubeStats(value: unknown): value is YoutubeStats {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function fetchYoutubeStatsBatch(ids: readonly string[]): Promise<YoutubeStats> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !ids.length) return {};
  const params = new URLSearchParams({ part: "statistics", id: ids.join(","), key });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
    next: { revalidate: 3_600 },
    signal: AbortSignal.timeout(SIGNAL_TIMEOUT_MS),
  });
  if (!response.ok) return {};
  const json = await response.json() as { items?: Array<{ id?: string; statistics?: { viewCount?: string; likeCount?: string } }> };
  const output: YoutubeStats = {};
  for (const entry of json.items ?? []) {
    if (!entry?.id || !ids.includes(entry.id)) continue;
    const views = Number(entry.statistics?.viewCount);
    const likes = Number(entry.statistics?.likeCount);
    output[entry.id] = {
      // likeCount is absent when a creator hides likes; never default it.
      ...(entry.statistics?.viewCount !== undefined && Number.isFinite(views) ? { views } : {}),
      ...(entry.statistics?.likeCount !== undefined && Number.isFinite(likes) ? { likes } : {}),
    };
  }
  return output;
}

async function youtubeStats(items: readonly WatchItem[]): Promise<YoutubeStats> {
  const ids = [...new Set(items.map(youtubeId).filter((id): id is string => Boolean(id)))]
    .slice(0, YOUTUBE_STATS_MAX_IDS)
    .sort();
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += 50) batches.push(ids.slice(index, index + 50));
  const results = await Promise.all(batches.map((batch) => {
    const digest = createHash("sha1").update(batch.join(",")).digest("hex").slice(0, 20);
    return cachedPublicData(`youtube-stats:v1:${digest}`, () => fetchYoutubeStatsBatch(batch), {
      freshSeconds: 3_600,
      staleSeconds: 86_400,
      validate: isYoutubeStats,
      shouldCache: (value) => Object.keys(value).length > 0,
    }).catch(() => ({} as YoutubeStats));
  }));
  return Object.assign({}, ...results) as YoutubeStats;
}

function isTwitchVodList(value: unknown): value is TwitchVod[] {
  return Array.isArray(value) && value.every((vod) => Boolean(
    vod && typeof vod === "object" && typeof vod.id === "string" && typeof vod.title === "string"
    && typeof vod.url === "string" && typeof vod.createdAt === "string" && typeof vod.duration === "string"
    && typeof vod.streamId === "string" && typeof vod.thumbnailUrl === "string" && Number.isFinite(vod.viewCount),
  ));
}

/** Twitch VOD views from the same cached archive the catalog already reads. */
async function twitchVodViews(items: readonly WatchItem[]): Promise<Record<string, number>> {
  const slugs = [...new Set(items.filter((item) => item.platform === "twitch" && item.kind === "vod" && item.memberSlug)
    .map((item) => item.memberSlug!))];
  const logins = slugs.map((slug) => MEMBERS_BY_SLUG[slug]?.twitchLogin).filter((login): login is string => Boolean(login));
  if (!logins.length || !process.env.TWITCH_CLIENT_ID) return {};
  const ids = await fetchUserIdsByLogin(logins);
  const lists = await Promise.all(logins.map(async (login) => {
    const userId = ids[login.toLowerCase()];
    if (!userId) return [];
    return cachedPublicData(`twitch-archive:v1:${userId}:16`, () => fetchChannelVideos(userId, 16, 1800), {
      freshSeconds: 1800,
      staleSeconds: 21_600,
      validate: isTwitchVodList,
      shouldCache: (value) => value.length > 0,
    }).catch(() => [] as TwitchVod[]);
  }));
  return Object.fromEntries(lists.flat().map((vod) => [`vod-${vod.id}`, vod.viewCount]));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin-managed clips carry provider counts; fans add CORE upvotes. */
async function clipSignals(items: readonly WatchItem[]): Promise<Record<string, { views?: number; likes?: number; upvotes?: number }>> {
  const ids = items.filter((item) => item.kind === "clip" && item.id.startsWith("clip-"))
    .map((item) => item.id.slice(5)).filter((id) => UUID.test(id));
  if (!ids.length) return {};
  const { rows } = await query<{ id: string; view_count: string | null; like_count: string | null; upvotes: string }>(
    `SELECT c.id::text, c.view_count::text, c.like_count::text,
            (SELECT COUNT(*) FROM clip_votes v WHERE v.clip_id = c.id)::text AS upvotes
       FROM clips c
      WHERE c.id = ANY($1::uuid[])`,
    [ids],
  );
  return Object.fromEntries(rows.map((row) => [`clip-${row.id}`, {
    ...(row.view_count !== null ? { views: Number(row.view_count) } : {}),
    ...(row.like_count !== null ? { likes: Number(row.like_count) } : {}),
    upvotes: Number(row.upvotes) || 0,
  }]));
}

/** The player records progress under the playable key; map back to items. */
export function watchRefsFor(item: WatchItem): string[] {
  const refs = new Set<string>([item.id]);
  try {
    const key = itemToPlayable(item)?.key;
    if (key) refs.add(key);
  } catch { /* A malformed href simply has no player ref. */ }
  return [...refs];
}

async function coreWatchSignals(items: readonly WatchItem[], since: Date | null): Promise<Record<string, { seconds: number; viewers: number }>> {
  const refToItem = new Map<string, string>();
  for (const item of items) for (const ref of watchRefsFor(item)) refToItem.set(ref, browseItemKey(item));
  if (!refToItem.size) return {};
  const { rows } = await query<{ item_ref: string; seconds: string; viewers: string }>(
    `SELECT item_ref, SUM(seconds)::text AS seconds, COUNT(DISTINCT user_id)::text AS viewers
       FROM fan_watch_time_events
      WHERE item_ref = ANY($1::text[]) AND source = 'site' AND measured = true
        AND ($2::timestamptz IS NULL OR observed_at >= $2::timestamptz)
      GROUP BY item_ref`,
    [[...refToItem.keys()], since?.toISOString() ?? null],
  );
  const output: Record<string, { seconds: number; viewers: number }> = {};
  for (const row of rows) {
    const key = refToItem.get(row.item_ref);
    if (!key) continue;
    const entry = output[key] ??= { seconds: 0, viewers: 0 };
    entry.seconds += Number(row.seconds) || 0;
    // Two refs for one item can double count a viewer; keep the larger set.
    entry.viewers = Math.max(entry.viewers, Number(row.viewers) || 0);
  }
  return output;
}

/** Loads only the signal the active sort needs, for only the filtered items. */
export async function loadBrowseSignals(items: readonly WatchItem[], filters: BrowseFilters, now: number): Promise<BrowseSignals> {
  const signals: BrowseSignals = {};
  const merge = (key: string, patch: BrowseSignals[string]) => { signals[key] = { ...signals[key], ...patch }; };
  if (filters.sort === "top") {
    const byId = new Map(items.map((item) => [item.id, item]));
    const [youtube, vods, clips] = await Promise.all([
      withTimeout(youtubeStats(items), {} as YoutubeStats),
      withTimeout(twitchVodViews(items), {} as Record<string, number>),
      withTimeout(clipSignals(items), {} as Awaited<ReturnType<typeof clipSignals>>),
    ]);
    for (const item of items) {
      const id = youtubeId(item);
      if (id && youtube[id]) merge(browseItemKey(item), youtube[id]);
    }
    for (const [id, views] of Object.entries(vods)) {
      const item = byId.get(id);
      if (item) merge(browseItemKey(item), { views });
    }
    for (const [id, signal] of Object.entries(clips)) {
      const item = byId.get(id);
      if (item) merge(browseItemKey(item), signal);
    }
  } else if (filters.sort === "watched") {
    const since = filters.window === "all" ? null : new Date(now - BROWSE_WINDOW_MS[filters.window]);
    const watched = await withTimeout(coreWatchSignals(items, since), {});
    for (const [key, entry] of Object.entries(watched)) merge(key, { coreSeconds: entry.seconds, coreViewers: entry.viewers });
  }
  return signals;
}
