import "server-only";

import { query } from "@/lib/db";
import { MEMBERS, MEMBERS_BY_SLUG } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { resolveYouTubeChannelId } from "@/lib/social-feed";
import { fetchUsersByLogin } from "@/lib/twitch";
import { formatDurationSeconds, isoDurationSeconds } from "@/lib/youtube-duration";
import type { WatchItem, WatchPlatform } from "@/lib/watch/types";
import { twitchDurationSeconds } from "@/lib/watch/normalize";
import { queueWatchItems, type IndexSummary } from "./ingest";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "./schema";
import { runMediaWorkerBatch, type MediaWorkerSummary } from "./worker";

const PROVIDER_TIMEOUT_MS = 20_000;
const WATCH_ARCHIVE_ITEM_LIMIT = 20_000;

export type MediaArchivePage = {
  items: WatchItem[];
  nextCursor: string | null;
  exhausted: boolean;
};

export type MediaArchiveSource = {
  key: string;
  provider: WatchPlatform;
  memberSlug: string | null;
  fetchPage(cursor: string | null, limit: number): Promise<MediaArchivePage>;
};

declare global {
  // eslint-disable-next-line no-var
  var __mediaArchiveSources: Map<string, MediaArchiveSource> | undefined;
}

const registeredSources = global.__mediaArchiveSources ?? new Map<string, MediaArchiveSource>();
global.__mediaArchiveSources = registeredSources;

/** Register licensed/private archive enumerators during server bootstrap. */
export function registerMediaArchiveSource(source: MediaArchiveSource): void {
  registeredSources.set(source.key, source);
}

function accentFor(slug: string | null): string {
  return (slug ? MEMBERS_BY_SLUG[slug]?.accent : null) ?? "#db0368";
}

function encodeCursor(value: Record<string, string>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | null): { publishedAt: string; id: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof parsed.publishedAt !== "string" || typeof parsed.id !== "string") return null;
    if (!Number.isFinite(Date.parse(parsed.publishedAt)) || !parsed.id) return null;
    return { publishedAt: parsed.publishedAt, id: parsed.id };
  } catch {
    return null;
  }
}

function socialCacheSources(): MediaArchiveSource[] {
  return (["instagram", "tiktok", "x"] as const).map((provider) => ({
    key: `social-cache:${provider}:v1`,
    provider,
    memberSlug: null,
    async fetchPage(rawCursor, limit) {
      const cursor = decodeCursor(rawCursor);
      if (rawCursor && !cursor) throw new Error("invalid_social_archive_cursor");
      const result = await query<{
        id: string;
        canonical_id: string;
        member_slug: string | null;
        content_type: "live" | "video" | "short" | "photo" | "post";
        title: string;
        body: string | null;
        href: string;
        artwork_url: string | null;
        orientation: "landscape" | "portrait" | "square" | null;
        published_at: string;
      }>(
        `SELECT id::text, canonical_id, member_slug, content_type, title, body, href,
                artwork_url, orientation, published_at::text
           FROM social_content_events
          WHERE provider = $1
            AND ($2::timestamptz IS NULL OR (published_at, id) < ($2::timestamptz, $3::uuid))
          ORDER BY published_at DESC, id DESC
          LIMIT $4`,
        [provider, cursor?.publishedAt ?? null, cursor?.id ?? null, limit],
      );
      const items = result.rows.map((row): WatchItem => {
        const externalId = row.canonical_id.startsWith(`${provider}:`)
          ? row.canonical_id.slice(provider.length + 1)
          : row.canonical_id;
        const member = row.member_slug ? MEMBERS_BY_SLUG[row.member_slug] : null;
        const photo = row.content_type === "photo";
        const post = row.content_type === "post";
        const live = row.content_type === "live";
        const short = row.content_type === "short";
        return {
          id: externalId,
          kind: live ? "live" : photo ? "tour" : post ? "post" : "clip",
          platform: provider,
          title: row.title,
          subtitle: row.body ?? member?.stageName ?? "CORE",
          poster: row.artwork_url ?? member?.portrait ?? "/embed-preview.png",
          backdrop: row.artwork_url ?? member?.portrait ?? "/embed-preview.png",
          memberSlug: row.member_slug,
          memberLabel: member?.stageName ?? "CORE",
          accent: accentFor(row.member_slug),
          href: row.href,
          sourceUrl: row.href,
          publishedAt: new Date(row.published_at).toISOString(),
          format: live ? "live" : photo ? "photo" : short ? "short" : "long",
          orientation: row.orientation ?? (photo ? "square" : short ? "portrait" : "landscape"),
          previewStrategy: "external",
          embeddable: false,
          focalPoint: { x: 0.5, y: 0.5 },
          liveCapability: provider === "x" ? "supported" : "unsupported",
          live: live ? { startedAt: row.published_at, type: "video" } : undefined,
        };
      });
      const last = result.rows.at(-1);
      return {
        items,
        nextCursor: last ? encodeCursor({ publishedAt: last.published_at, id: last.id }) : null,
        exhausted: result.rows.length < limit,
      };
    },
  }));
}

function twitchArchiveItem(member: (typeof MEMBERS)[number], vod: {
  id: string; stream_id?: string; title?: string; url: string; thumbnail_url?: string;
  duration?: string; created_at: string;
}): WatchItem {
  const durationSeconds = twitchDurationSeconds(vod.duration ?? "");
  const thumbnail = (vod.thumbnail_url ?? member.portrait)
    .replace("%{width}", "640").replace("%{height}", "360");
  return {
    id: `vod-${vod.id}`,
    kind: "vod",
    platform: "twitch",
    title: vod.title?.trim() || `${member.stageName} past broadcast`,
    subtitle: `${member.stageName} · Past broadcast`,
    poster: thumbnail,
    backdrop: thumbnail,
    memberSlug: member.slug,
    memberLabel: member.stageName,
    accountLabel: `@${member.twitchLogin}`,
    accent: member.accent,
    href: `/theater?kind=vod&id=${encodeURIComponent(vod.id)}&slug=${encodeURIComponent(member.slug)}`,
    sourceUrl: vod.url,
    publishedAt: vod.created_at,
    durationSeconds,
    duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
    format: "long",
    orientation: "landscape",
    previewStrategy: "embed",
    embeddable: true,
    focalPoint: { x: 0.5, y: 0.5 },
    liveCapability: "supported",
    twitch: { streamId: vod.stream_id, vodId: vod.id },
  };
}

async function twitchArchiveSources(): Promise<MediaArchiveSource[]> {
  if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_CLIENT_SECRET) return [];
  const users: Awaited<ReturnType<typeof fetchUsersByLogin>> = await fetchUsersByLogin(
    MEMBERS.map((member) => member.twitchLogin),
  ).catch(() => ({}));
  return MEMBERS.flatMap((member): MediaArchiveSource[] => {
    const userId = users[member.twitchLogin.toLowerCase()]?.id;
    if (!userId) return [];
    return [{
      key: `twitch:${userId}:archives:v1`,
      provider: "twitch",
      memberSlug: member.slug,
      async fetchPage(cursor, limit) {
        const tokenParams = new URLSearchParams({
          client_id: process.env.TWITCH_CLIENT_ID!,
          client_secret: process.env.TWITCH_CLIENT_SECRET!,
          grant_type: "client_credentials",
        });
        const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: tokenParams.toString(),
          cache: "no-store",
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
        if (!tokenResponse.ok) throw new Error(`twitch_archive_token_${tokenResponse.status}`);
        const token = (await tokenResponse.json() as { access_token?: string }).access_token;
        if (!token) throw new Error("twitch_archive_token_missing");
        const url = new URL("https://api.twitch.tv/helix/videos");
        url.searchParams.set("user_id", userId);
        url.searchParams.set("type", "archive");
        url.searchParams.set("sort", "time");
        url.searchParams.set("first", String(Math.min(100, Math.max(1, limit))));
        if (cursor) url.searchParams.set("after", cursor);
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID! },
          cache: "no-store",
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`twitch_archive_page_${response.status}`);
        const body = await response.json() as {
          data?: Array<{ id: string; stream_id?: string; title?: string; url: string; thumbnail_url?: string; duration?: string; created_at: string }>;
          pagination?: { cursor?: string };
        };
        const rows = body.data ?? [];
        const nextCursor = body.pagination?.cursor?.trim() || null;
        return { items: rows.map((vod) => twitchArchiveItem(member, vod)), nextCursor, exhausted: !nextCursor };
      },
    }];
  });
}

const uploadsPlaylistCache = new Map<string, string>();

type YouTubeArchiveTarget = {
  ref: string;
  memberSlug: string | null;
  label: string;
};

/**
 * Keep archive ownership as specific as the channel page. A creator can have
 * Main, Live, VOD, and Clips channels; collapsing them to one member label
 * makes a full archive impossible to browse source-by-source later.
 */
function youtubeArchiveTargets(): YouTubeArchiveTarget[] {
  const targets: YouTubeArchiveTarget[] = [];
  const add = (ref: string | undefined, memberSlug: string | null, label: string) => {
    const normalized = ref?.trim();
    if (!normalized) return;
    targets.push({ ref: normalized, memberSlug, label });
  };

  add(
    GROUP.socials.youtube.channelId || GROUP.socials.youtube.url || GROUP.socials.youtube.handle,
    null,
    GROUP.name,
  );

  for (const member of MEMBERS) {
    for (const social of member.socials) {
      if (social.platform !== "youtube") continue;
      add(
        social.url || social.handle || member.youtubeChannelId,
        member.slug,
        social.label?.trim() ? `${member.stageName} · ${social.label.trim()}` : member.stageName,
      );
    }
    // Preserve a configured primary ID even if it has not been represented by
    // a social record yet.
    if (!member.socials.some((social) => social.platform === "youtube")) {
      add(member.youtubeChannelId, member.slug, member.stageName);
    }
  }
  return targets;
}

async function youtubeUploadsPlaylist(channelId: string, key: string): Promise<string> {
  const cached = uploadsPlaylistCache.get(channelId);
  if (cached) return cached;
  const params = new URLSearchParams({ part: "contentDetails", id: channelId, key });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`youtube_channel_${response.status}`);
  const body = await response.json() as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
  const uploads = body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("youtube_uploads_playlist_missing");
  uploadsPlaylistCache.set(channelId, uploads);
  return uploads;
}

async function youtubeArchiveSources(): Promise<MediaArchiveSource[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return [];
  const sources = new Map<string, MediaArchiveSource>();
  for (const target of youtubeArchiveTargets()) {
    const channelId = await resolveYouTubeChannelId(target.ref).catch(() => null);
    if (!channelId || sources.has(channelId)) continue;
    sources.set(channelId, {
      key: `youtube:${channelId}:uploads:v1`,
      provider: "youtube",
      memberSlug: target.memberSlug,
      async fetchPage(cursor, limit) {
          const uploads = await youtubeUploadsPlaylist(channelId, key);
          const playlistParams = new URLSearchParams({
            part: "snippet,contentDetails",
            playlistId: uploads,
            maxResults: String(Math.min(50, Math.max(1, limit))),
            key,
          });
          if (cursor) playlistParams.set("pageToken", cursor);
          const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${playlistParams}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
          });
          if (!playlistResponse.ok) throw new Error(`youtube_archive_page_${playlistResponse.status}`);
          const playlist = await playlistResponse.json() as {
            nextPageToken?: string;
            items?: Array<{ contentDetails?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string } } } }>;
          };
          const ids = (playlist.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id));
          const detailParams = new URLSearchParams({ part: "snippet,contentDetails,liveStreamingDetails,status", id: ids.join(","), key });
          const detailResponse = ids.length
            ? await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`, {
                cache: "no-store",
                signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
              })
            : null;
          if (detailResponse && !detailResponse.ok) throw new Error(`youtube_archive_details_${detailResponse.status}`);
          const details = detailResponse ? await detailResponse.json() as {
            items?: Array<{
              id?: string;
              snippet?: { title?: string; publishedAt?: string; liveBroadcastContent?: string; thumbnails?: { high?: { url?: string }; medium?: { url?: string } } };
              contentDetails?: { duration?: string };
              liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
              status?: { embeddable?: boolean; privacyStatus?: string };
            }>;
          } : { items: [] };
          const member = target.memberSlug ? MEMBERS_BY_SLUG[target.memberSlug] : null;
          const items = (details.items ?? []).flatMap((video): WatchItem[] => {
            if (!video.id || video.status?.privacyStatus === "private") return [];
            const durationSeconds = isoDurationSeconds(video.contentDetails?.duration ?? "");
            const title = video.snippet?.title?.trim() || `${target.label} video`;
            const isShort = Boolean(durationSeconds && (
              durationSeconds <= 60 || (durationSeconds <= 180 && /(?:^|\s)#?shorts?(?:\s|$|[.!?])/i.test(title))
            ));
            const replay = Boolean(video.liveStreamingDetails?.actualStartTime && video.liveStreamingDetails?.actualEndTime);
            const poster = video.snippet?.thumbnails?.high?.url ?? video.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`;
            return [{
              id: `yt-${video.id}`,
              kind: replay ? "vod" : "youtube",
              platform: "youtube",
              title,
              subtitle: replay ? `${target.label} · Past broadcast` : target.label,
              poster,
              backdrop: `https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`,
              memberSlug: target.memberSlug,
              memberLabel: member?.stageName ?? target.label,
              accountLabel: target.label,
              accent: accentFor(target.memberSlug),
              href: `/theater?kind=youtube&id=${encodeURIComponent(video.id)}&slug=${encodeURIComponent(target.memberSlug ?? "house")}`,
              sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${video.id}`,
              publishedAt: video.liveStreamingDetails?.actualStartTime ?? video.snippet?.publishedAt,
              durationSeconds: durationSeconds ?? undefined,
              duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
              format: isShort ? "short" : "long",
              orientation: isShort ? "portrait" : "landscape",
              previewStrategy: "animated",
              embeddable: video.status?.embeddable ?? true,
              focalPoint: { x: 0.5, y: 0.5 },
              liveCapability: "supported",
            }];
          });
          const nextCursor = playlist.nextPageToken?.trim() || null;
          return { items, nextCursor, exhausted: !nextCursor };
      },
    });
  }
  return [...sources.values()];
}

/**
 * The archive worker persists the exact normalized WatchItem it discovered.
 * Reading it back makes every fully-paginated YouTube uploads playlist part
 * of the public catalog without replaying the whole provider history during a
 * visitor request. Absence of the optional archive database is a normal
 * staged-rollout state and simply returns no historical supplement.
 */
export async function loadArchivedYouTubeWatchItems(
  limit = WATCH_ARCHIVE_ITEM_LIMIT,
): Promise<WatchItem[]> {
  const bounded = Math.max(1, Math.min(WATCH_ARCHIVE_ITEM_LIMIT, Math.trunc(limit)));
  try {
    const result = await mediaIntelligenceQuery<{ item: WatchItem }>(
      `SELECT item
         FROM media_intelligence_assets
        WHERE active
          AND platform = 'youtube'
          AND item IS NOT NULL
        ORDER BY published_at DESC NULLS LAST, updated_at DESC
        LIMIT $1`,
      [bounded],
    );
    return result.rows.flatMap(({ item }) => {
      if (!item || item.platform !== "youtube" || !item.id || !item.title || !item.href) return [];
      return [item];
    });
  } catch {
    return [];
  }
}

async function availableArchiveSources(): Promise<MediaArchiveSource[]> {
  const builtIn = [
    ...socialCacheSources(),
    ...await twitchArchiveSources(),
    ...await youtubeArchiveSources(),
  ];
  return [...new Map([...builtIn, ...registeredSources.values()].map((source) => [source.key, source])).values()];
}

type CheckpointRow = {
  source_key: string;
  status: "pending" | "running" | "complete" | "failed";
  cursor: string | null;
  page_count: number;
  updated_at: string;
};

async function claimCheckpoint(source: MediaArchiveSource, workerId: string): Promise<string | null | undefined> {
  return withMediaIntelligenceTransaction(async (client) => {
    await client.query(
      `INSERT INTO media_intelligence_archive_checkpoints (source_key, provider, member_slug)
       VALUES ($1,$2,$3) ON CONFLICT (source_key) DO NOTHING`,
      [source.key, source.provider, source.memberSlug],
    );
    const result = await client.query<{ cursor: string | null }>(
      `UPDATE media_intelligence_archive_checkpoints
          SET status = 'running', lease_owner = $2,
              lease_expires_at = now() + interval '5 minutes', updated_at = now(), last_error = NULL
        WHERE source_key = $1 AND completed_at IS NULL
          AND (status <> 'running' OR lease_expires_at < now())
        RETURNING cursor`,
      [source.key, workerId.slice(0, 160)],
    );
    return result.rows[0] ? result.rows[0].cursor : undefined;
  });
}

async function completeCheckpointPage(input: {
  source: MediaArchiveSource;
  workerId: string;
  cursor: string | null;
  nextCursor: string | null;
  itemCount: number;
  exhausted: boolean;
}): Promise<void> {
  if (!input.exhausted && input.nextCursor === input.cursor) throw new Error("archive_cursor_did_not_advance");
  await mediaIntelligenceQuery(
    `UPDATE media_intelligence_archive_checkpoints
        SET cursor = $3, status = CASE WHEN $5 THEN 'complete' ELSE 'pending' END,
            page_count = page_count + 1, item_count = item_count + $4,
            lease_owner = NULL, lease_expires_at = NULL, updated_at = now(),
            completed_at = CASE WHEN $5 THEN now() ELSE NULL END, last_error = NULL
      WHERE source_key = $1 AND status = 'running' AND lease_owner = $2`,
    [input.source.key, input.workerId.slice(0, 160), input.nextCursor, input.itemCount, input.exhausted],
  );
}

async function failCheckpoint(sourceKey: string, workerId: string, error: unknown): Promise<void> {
  await mediaIntelligenceQuery(
    `UPDATE media_intelligence_archive_checkpoints
        SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL,
            updated_at = now(), last_error = $3
      WHERE source_key = $1 AND status = 'running' AND lease_owner = $2`,
    [sourceKey, workerId.slice(0, 160), (error instanceof Error ? error.message : String(error)).slice(0, 2_000)],
  );
}

export type MediaArchiveBackfillSummary = {
  sourcesAvailable: number;
  sourcesCompleted: number;
  pagesProcessed: number;
  itemsDiscovered: number;
  queued: number;
  unchanged: number;
  failed: number;
  worker: MediaWorkerSummary;
};

export async function runMediaArchiveBackfillBatch(options: {
  workerId?: string;
  maxPages?: number;
  pageSize?: number;
  maxJobs?: number;
} = {}): Promise<MediaArchiveBackfillSummary> {
  const workerId = options.workerId?.trim() || `archive:${process.pid}`;
  const maxPages = Math.max(0, Math.min(100, Math.trunc(options.maxPages ?? 24)));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(options.pageSize ?? 50)));
  const sources = await availableArchiveSources();
  const checkpoints = await mediaIntelligenceQuery<CheckpointRow>(
    `SELECT source_key, status, cursor, page_count, updated_at::text
       FROM media_intelligence_archive_checkpoints`,
  );
  const state = new Map(checkpoints.rows.map((row) => [row.source_key, row]));
  const ordered = [...sources].sort((left, right) => {
    const a = state.get(left.key);
    const b = state.get(right.key);
    if (a?.status === "complete" && b?.status !== "complete") return 1;
    if (b?.status === "complete" && a?.status !== "complete") return -1;
    return (a?.page_count ?? 0) - (b?.page_count ?? 0)
      || Date.parse(a?.updated_at ?? "1970-01-01") - Date.parse(b?.updated_at ?? "1970-01-01");
  });
  const summary: MediaArchiveBackfillSummary = {
    sourcesAvailable: sources.length,
    sourcesCompleted: checkpoints.rows.filter((row) => row.status === "complete").length,
    pagesProcessed: 0,
    itemsDiscovered: 0,
    queued: 0,
    unchanged: 0,
    failed: 0,
    worker: { claimed: 0, analyzed: 0, unchanged: 0, failed: 0, outboxPublished: 0 },
  };
  for (const source of ordered.slice(0, maxPages)) {
    const cursor = await claimCheckpoint(source, workerId);
    if (cursor === undefined) continue;
    try {
      const page = await source.fetchPage(cursor, pageSize);
      const queued: IndexSummary = await queueWatchItems(page.items);
      await completeCheckpointPage({ source, workerId, cursor, nextCursor: page.nextCursor, itemCount: page.items.length, exhausted: page.exhausted });
      summary.pagesProcessed += 1;
      summary.itemsDiscovered += page.items.length;
      summary.queued += queued.queued;
      summary.unchanged += queued.unchanged;
      summary.failed += queued.failed;
      if (page.exhausted) summary.sourcesCompleted += 1;
    } catch (error) {
      await failCheckpoint(source.key, workerId, error).catch(() => {});
      summary.failed += 1;
    }
  }
  summary.worker = await runMediaWorkerBatch({
    workerId: `${workerId}:jobs`,
    maxJobs: options.maxJobs ?? Math.max(50, summary.queued),
  });
  summary.failed += summary.worker.failed;
  return summary;
}
