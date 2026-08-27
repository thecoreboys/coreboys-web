import "server-only";
import { unstable_cache } from "next/cache";

/** Official-API social feed aggregation. Every credential is server-only. */

// Feed types live in a client-safe module so client components can import
// the shape without dragging this `server-only` module into their bundle.
import type { FeedItem } from "@/components/feed/types";
export type { FeedItem, SocialPlatform } from "@/components/feed/types";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import { formatDurationSeconds } from "@/lib/youtube-duration";
import {
  resolveSocialCredential,
  type IngestProvider,
  type SocialCredentialState,
} from "@/lib/watch/social-credentials";
import { getXFeedSnapshot } from "@/lib/x-feed-snapshot";
import { extractPublicTikTokPosts } from "@/lib/tiktok-public";

const CENTER = { x: 0.5, y: 0.5 } as const;
// Public routes can render the catalog frequently, but provider reads must be
// shared at the server layer rather than repeated for every viewer. Keep this
// short enough for a new upload to surface quickly while one cache fill serves
// every home, channel, Guide, and Shorts render in that window.
const SOCIAL_FEED_CACHE_SECONDS = 60;
export const SOCIAL_FEED_CACHE_TAG = "core-social-feed-v1";
// Public TikTok profile documents are both large and rate-limited. This is a
// best-effort discovery fallback only; the site-wide feed cache coalesces
// render requests and this longer profile window prevents a viewer spike from
// turning into a scrape spike.
const TIKTOK_PUBLIC_PROFILE_CACHE_SECONDS = 300;

function bareHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

function cleanTitle(raw: string | undefined, fallback: string): string {
  const text = raw?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : fallback;
}

function isoTimestamp(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = Date.parse(raw);
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function decodeXml(raw: string): string {
  return raw
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

// ---------------------------------------------------------------------------
// YouTube — RSS, no key required.
// ---------------------------------------------------------------------------

/**
 * Fetches the latest videos from a YouTube channel via the public RSS
 * feed. Channel IDs follow the `UCxxxxxxxxxxxxxxxxxxxxx` form — that's
 * what `https://www.youtube.com/feeds/videos.xml?channel_id=UC...`
 * accepts. There is no API key required for this endpoint.
 */
export async function fetchYouTubeChannelFeed(
  channelId: string,
  authorSlug: string | null,
  authorLabel: string,
  limit = 6,
): Promise<FeedItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const res = await fetch(url, { next: { revalidate: SOCIAL_FEED_CACHE_SECONDS } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseYouTubeRss(xml, authorSlug, authorLabel).slice(0, limit);
  } catch {
    return [];
  }
}

function parseYouTubeRss(
  xml: string,
  authorSlug: string | null,
  authorLabel: string,
): FeedItem[] {
  const items: FeedItem[] = [];
  // Loose regex parser — sufficient for YouTube's stable RSS shape and
  // avoids pulling in a full XML lib for one endpoint.
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1] ?? "";
    const id = pick(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = pick(block, /<title>([^<]+)<\/title>/);
    const description = pick(block, /<media:description>([\s\S]*?)<\/media:description>/);
    const published = pick(block, /<published>([^<]+)<\/published>/);
    const thumb = pick(block, /<media:thumbnail[^>]*url="([^"]+)"/);
    const publishedAt = isoTimestamp(published);
    if (!id || !title || !publishedAt) continue;
    const sourceUrl = `https://www.youtube.com/watch?v=${id}`;
    const shortHint = /(?:^|\s)#?shorts?(?:\s|$|[.!?])/i.test(`${title} ${description}`);
    items.push({
      id: `yt-${id}`,
      platform: "youtube",
      url: sourceUrl,
      sourceUrl,
      title: decodeXml(title),
      publishedAt,
      authorSlug,
      authorLabel,
      thumbnailUrl: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      mediaType: "video",
      orientation: shortHint ? "portrait" : "landscape",
      format: shortHint ? "short" : "long",
      previewStrategy: "animated",
      embeddable: true,
      focalPoint: CENTER,
    });
  }
  return items;
}

function pick(block: string, re: RegExp): string {
  const m = re.exec(block);
  return m?.[1]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Channel-ID resolution — handle (@name) → UC… channel id, no API key.
// ---------------------------------------------------------------------------

const CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/;

/**
 * Verified public channel ids for the roster's linked YouTube accounts. This
 * keeps official RSS working without spending Data API quota. Environment
 * mappings and the Data API remain authoritative overrides/fallbacks.
 */
export const ROSTER_YOUTUBE_CHANNEL_IDS: Readonly<Record<string, string>> = {
  mar3lg: "UC7RNjS5nGShmMSuMcVgUyjQ",
  othersideofmarlon: "UCvqrTz9MEd4UPseqJpckk_g",
  marlonvods: "UCSTR08UDFFDEVmyq88gxftQ",
  lacyhimself: "UCeoZXkaJDtdTHafgoZeDcAA",
  lacylive: "UC7qDQ-DAG_JcrMM8yZ4D8Bw",
  silky2: "UC1_YgcD2KaEJNWx4pChJHyg",
  silkylive: "UCsx2dUKBb5vAYuXq-bqlfuQ",
  adapt: "UCi87kxosIT3wrnEA-mv4jWA",
  fazeadaptlive: "UCJKdgzE45ucqAukhKr_6bxw",
  stableronaldoyt: "UCav7eOwYM9Bwxlgnts0y74Q",
  stableronaldolive: "UCLldJScHWCtsFlfanYXS8nQ",
  thestableyt: "UCTiWiQy8LVRVRsTERuow16w",
  jasontheweenie: "UCxoKaKMzulp6sfQGOhNJnzQ",
  jasontheweenirl: "UCWSZ569cfHihRN7boxLV74w",
  jasontheweenciips: "UClK4S3kGZN8YTiWA1MRaH0g",
  jasontheweenvod: "UClrFCIeoqzXsxKjaapjNSAA",
};

function youtubeRefKey(raw: string): string {
  const value = raw.trim();
  const candidate =
    value.match(/youtube\.com\/@([^/?#]+)/i)?.[1] ??
    value.match(/youtube\.com\/(?:c\/|user\/|channel\/)([^/?#]+)/i)?.[1] ??
    value.replace(/^@/, "");
  return candidate.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Resolve a channel from explicit/static configuration without an API read. */
export function configuredYouTubeChannelId(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (CHANNEL_ID_RE.test(trimmed)) return trimmed;
  const fromUrl = trimmed.match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (fromUrl) return fromUrl[1] ?? null;

  let configuredIds: Record<string, string> = {};
  try {
    configuredIds = JSON.parse(process.env.YOUTUBE_CHANNEL_IDS_JSON ?? "{}") as Record<string, string>;
  } catch {
    configuredIds = {};
  }
  const refKey = youtubeRefKey(trimmed);
  for (const lookup of [trimmed, trimmed.toLowerCase(), bareHandle(trimmed), refKey]) {
    const configured = configuredIds[lookup] ?? configuredIds[lookup.toLowerCase()];
    if (configured && CHANNEL_ID_RE.test(configured)) return configured;
  }
  return ROSTER_YOUTUBE_CHANNEL_IDS[refKey] ?? null;
}

export type ConfiguredYouTubeWebhookChannel = {
  channelId: string;
  memberSlug: string | null;
  accountLabel: string;
};

/**
 * All no-quota YouTube channels that can be safely provisioned for WebSub.
 * Unresolved handles remain on the reconciliation path until an explicit id is
 * added instead of spending a Data API lookup during subscription renewal.
 */
export function configuredYouTubeWebhookChannels(): ConfiguredYouTubeWebhookChannel[] {
  const channels: ConfiguredYouTubeWebhookChannel[] = [];
  const add = (ref: string | undefined, memberSlug: string | null, accountLabel: string) => {
    const channelId = ref ? configuredYouTubeChannelId(ref) : null;
    if (channelId && !channels.some((entry) => entry.channelId === channelId)) {
      channels.push({ channelId, memberSlug, accountLabel });
    }
  };

  add(
    GROUP.socials.youtube.channelId || GROUP.socials.youtube.url || GROUP.socials.youtube.handle,
    null,
    GROUP.name,
  );
  for (const member of MEMBERS) {
    add(member.youtubeChannelId, member.slug, member.stageName);
    for (const social of member.socials) {
      if (social.platform !== "youtube") continue;
      add(
        social.url || social.handle,
        member.slug,
        social.label?.trim() ? `${member.stageName} · ${social.label.trim()}` : member.stageName,
      );
    }
  }
  return channels;
}

/**
 * Resolves a YouTube channel reference to a `UCxxxx` channel id so it can
 * be fed to the RSS endpoint. Accepts a bare channel id, a
 * `/channel/UC…` URL, or an `@handle` / handle URL. Handle resolution uses
 * the official YouTube Data API when `YOUTUBE_API_KEY` is configured.
 *
 * Cached for a day via Next's fetch cache; the mapping never changes.
 * Returns `null` if it can't resolve (caller skips that channel).
 */
export async function resolveYouTubeChannelId(
  ref: string,
): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const configuredChannelId = configuredYouTubeChannelId(trimmed);
  if (configuredChannelId) return configuredChannelId;

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const handle = (
    trimmed.match(/youtube\.com\/@([^/?#]+)/i)?.[1] ??
    trimmed.match(/youtube\.com\/(?:c\/|user\/|channel\/)([^/?#]+)/i)?.[1] ??
    trimmed.replace(/^@/, "")
  ).trim();
  if (!handle) return null;

  try {
    const resolveChannel = async (selector: "forHandle" | "forUsername") => {
      const params = new URLSearchParams({ part: "id", [selector]: handle, key });
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
        next: { revalidate: 86_400 },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { items?: Array<{ id?: string }> };
      const id = json.items?.[0]?.id;
      return id && CHANNEL_ID_RE.test(id) ? id : null;
    };

    // Modern @handles resolve with forHandle; legacy /c/ and /user/ URLs can
    // still be usernames, so keep the official forUsername fallback.
    const direct = await resolveChannel("forHandle");
    if (direct) return direct;
    const legacy = await resolveChannel("forUsername");
    if (legacy) return legacy;

    // Last official-API fallback for old custom URLs. This is intentionally
    // only used after the quota-cheap channel lookups fail, and is cached for
    // a day. Runtime HTML/channel-page scraping is never used.
    const search = new URLSearchParams({
      part: "snippet",
      type: "channel",
      maxResults: "5",
      q: handle,
      key,
    });
    const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?${search}`, {
      next: { revalidate: 86_400 },
    });
    if (!searchRes.ok) return null;
    const searchJson = (await searchRes.json()) as {
      items?: Array<{ id?: { channelId?: string }; snippet?: { channelTitle?: string } }>;
    };
    const candidates = searchJson.items ?? [];
    const normalizedHandle = handle.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const exact = candidates.find((item) =>
      item.snippet?.channelTitle?.replace(/[^a-z0-9]/gi, "").toLowerCase() === normalizedHandle,
    );
    const id = exact?.id?.channelId ?? candidates[0]?.id?.channelId;
    return id && CHANNEL_ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest videos for a channel referenced by handle/URL/id —
 * resolves to a channel id first, then reads the RSS feed. Returns `[]`
 * (never throws) so a single bad channel can't break an aggregation.
 */
export async function fetchYouTubeFeedByRef(
  ref: string,
  authorSlug: string | null,
  authorLabel: string,
  limit = 6,
): Promise<FeedItem[]> {
  const channelId = await resolveYouTubeChannelId(ref);
  if (!channelId) return [];
  return fetchYouTubeChannelFeed(channelId, authorSlug, authorLabel, limit);
}

// ---------------------------------------------------------------------------
// X — durable snapshot only. Upstream reads run exclusively from cron.
// ---------------------------------------------------------------------------

function xItemHandle(item: FeedItem): string | null {
  const metadataHandle = item.x?.authorHandle;
  if (metadataHandle) return bareHandle(metadataHandle);
  try {
    const url = new URL(item.sourceUrl ?? item.url);
    const [handle] = url.pathname.split("/").filter(Boolean);
    return handle ? bareHandle(handle) : null;
  } catch {
    return null;
  }
}

type XSnapshotAccount = {
  handle: string;
  authorSlug: string | null;
  authorLabel: string;
};

async function fetchXFeedsFromSnapshot(
  accounts: readonly XSnapshotAccount[],
  perAccountLimit: number,
): Promise<FeedItem[]> {
  if (perAccountLimit <= 0) return [];
  const requested = new Map<string, XSnapshotAccount>();
  for (const account of accounts) {
    const handle = bareHandle(account.handle);
    if (handle && !requested.has(handle)) requested.set(handle, account);
  }
  if (requested.size === 0) return [];

  const accepted = new Map<string, number>();
  const items = await getXFeedSnapshot();
  return items.flatMap((item): FeedItem[] => {
    if (item.platform !== "x") return [];
    const handle = xItemHandle(item);
    if (!handle) return [];
    const account = requested.get(handle);
    if (!account) return [];
    const count = accepted.get(handle) ?? 0;
    if (count >= perAccountLimit * 4) return [];
    accepted.set(handle, count + 1);
    return [{
      ...item,
      authorSlug: account.authorSlug,
      authorLabel: account.authorLabel,
    }];
  });
}

/**
 * Backwards-compatible account filter over the durable X snapshot. This
 * function never calls X; missing, failed, or stale snapshots fail closed.
 */
export async function fetchXFeed(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
): Promise<FeedItem[]> {
  const handle = bareHandle(rawHandle);
  if (!handle || limit <= 0) return [];
  return fetchXFeedsFromSnapshot(
    [{ handle, authorSlug, authorLabel }],
    limit,
  );
}

// ---------------------------------------------------------------------------
// TikTok Display API — each account must authorize `video.list`.
// ---------------------------------------------------------------------------

export type OfficialSocialFeedState =
  | SocialCredentialState
  | "ok"
  | "empty"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "upstream_error"
  | "invalid_response";

export type OfficialSocialFeedResult = {
  provider: IngestProvider;
  /** Normalized public account handle. */
  handle: string;
  state: OfficialSocialFeedState;
  items: FeedItem[];
  /** Whether a later automatic retry can reasonably recover. */
  retryable: boolean;
  credentialSource: "env" | null;
};

function feedResult(
  provider: IngestProvider,
  handle: string,
  state: OfficialSocialFeedState,
  items: FeedItem[] = [],
  credentialSource: "env" | null = null,
): OfficialSocialFeedResult {
  return {
    provider,
    handle,
    state,
    items,
    retryable:
      state === "rate_limited" ||
      state === "upstream_error",
    credentialSource,
  };
}

function httpFeedState(status: number): OfficialSocialFeedState {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "invalid_response";
}

export async function fetchTikTokFeed(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
): Promise<FeedItem[]> {
  const authorized = await fetchTikTokFeedResult(rawHandle, authorSlug, authorLabel, limit);
  if (authorized.items.length >= limit) return authorized.items.slice(0, limit);

  // A canonical post URL can always use TikTok's public player. Creator OAuth
  // is only needed for the richer Display API; merge a public-profile window
  // whenever that account is not connected or the token feed is incomplete.
  const publicItems = await fetchPublicTikTokProfileFeed(
    rawHandle,
    authorSlug,
    authorLabel,
    Math.max(0, limit - authorized.items.length),
  );
  const seen = new Set<string>();
  return [...authorized.items, ...publicItems]
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

/**
 * Fetch the posts visibly present in TikTok's public profile hydration data.
 * This never uses a user cookie, token, or a browser session. TikTok may
 * instead serve a JS/anti-bot shell; that is a normal empty result. The UI
 * reports the missing creator authorization instead of inventing media cards.
 */
export async function fetchPublicTikTokProfileFeed(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
): Promise<FeedItem[]> {
  const handle = bareHandle(rawHandle);
  if (!handle || limit <= 0) return [];
  try {
    const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(handle)}`, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; COREMediaBot/1.0; +https://thecoreboys.com)",
        "accept-language": "en-US,en;q=0.9",
        accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: TIKTOK_PUBLIC_PROFILE_CACHE_SECONDS, tags: [SOCIAL_FEED_CACHE_TAG] },
    });
    if (!response.ok) return [];
    const posts = extractPublicTikTokPosts(await response.text(), handle, Math.min(24, limit));
    return posts.map((post): FeedItem => {
      const ratio = post.width && post.height ? post.width / post.height : null;
      const orientation = ratio === null ? "portrait" : ratio > 1.12 ? "landscape" : ratio < 0.89 ? "portrait" : "square";
      const sourceUrl = `https://www.tiktok.com/@${handle}/video/${post.id}`;
      return {
        id: `tt-${post.id}`,
        platform: "tiktok",
        url: sourceUrl,
        sourceUrl,
        embedUrl: `https://www.tiktok.com/player/v1/${post.id}`,
        title: cleanTitle(post.title, `${authorLabel} on TikTok`),
        publishedAt: new Date(post.createdAt * 1000).toISOString(),
        authorSlug,
        authorLabel,
        thumbnailUrl: post.thumbnailUrl,
        mediaType: "video",
        orientation,
        width: post.width,
        height: post.height,
        format: "short",
        previewStrategy: "embed",
        embeddable: true,
        focalPoint: CENTER,
        liveCapability: "unsupported",
      };
    });
  } catch {
    return [];
  }
}

/** Fetch TikTok media while preserving a token-free operator diagnostic. */
export async function fetchTikTokFeedResult(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
): Promise<OfficialSocialFeedResult> {
  const resolution = await resolveSocialCredential("tiktok", rawHandle);
  const credential = resolution.credential;
  if (!credential) return feedResult("tiktok", resolution.handle, resolution.state);
  if (limit <= 0) {
    return feedResult("tiktok", resolution.handle, "empty", [], credential.source);
  }

  try {
    const fields = [
      "id",
      "create_time",
      "cover_image_url",
      "share_url",
      "video_description",
      "duration",
      "height",
      "width",
      "title",
      "embed_link",
    ].join(",");
    const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: Math.max(1, Math.min(20, limit)) }),
      cache: "no-store",
    });
    if (!res.ok) {
      return feedResult(
        "tiktok",
        resolution.handle,
        httpFeedState(res.status),
        [],
        credential.source,
      );
    }
    const json = (await res.json().catch(() => null)) as {
      data?: {
        videos?: Array<{
          id?: string;
          create_time?: number | string;
          cover_image_url?: string;
          share_url?: string;
          video_description?: string;
          duration?: number;
          height?: number;
          width?: number;
          title?: string;
          embed_link?: string;
        }>;
      };
      error?: { code?: string };
    } | null;
    if (!json) {
      return feedResult("tiktok", resolution.handle, "invalid_response", [], credential.source);
    }
    if (json.error?.code && json.error.code !== "ok") {
      return feedResult("tiktok", resolution.handle, "invalid_response", [], credential.source);
    }
    if (!Array.isArray(json.data?.videos)) {
      return feedResult("tiktok", resolution.handle, "invalid_response", [], credential.source);
    }
    const items = json.data.videos.flatMap((video): FeedItem[] => {
      const createdAt = Number(video.create_time);
      if (!video.id || !Number.isFinite(createdAt) || createdAt <= 0) return [];
      const sourceUrl = video.share_url || `https://www.tiktok.com/@${resolution.handle}/video/${video.id}`;
      const durationSeconds = video.duration && video.duration > 0 ? video.duration : undefined;
      const ratio = video.width && video.height ? video.width / video.height : null;
      const orientation = ratio === null
        ? "portrait"
        : ratio > 1.12
          ? "landscape"
          : ratio < 0.89
            ? "portrait"
            : "square";
      return [{
        id: `tt-${video.id}`,
        platform: "tiktok",
        url: sourceUrl,
        sourceUrl,
        embedUrl: video.embed_link || `https://www.tiktok.com/player/v1/${video.id}`,
        title: cleanTitle(video.title || video.video_description, `${authorLabel} on TikTok`),
        publishedAt: new Date(createdAt * 1000).toISOString(),
        authorSlug,
        authorLabel,
        thumbnailUrl: video.cover_image_url,
        mediaType: "video",
        // Preserve the video's intrinsic shape. TikTok is usually vertical,
        // but its API also returns genuine square and landscape uploads.
        orientation,
        width: video.width,
        height: video.height,
        format: "short",
        previewStrategy: "embed",
        embeddable: true,
        focalPoint: CENTER,
        durationSeconds,
        duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
        liveCapability: "unsupported",
      }];
    });
    return feedResult(
      "tiktok",
      resolution.handle,
      items.length ? "ok" : json.data.videos.length ? "invalid_response" : "empty",
      items,
      credential.source,
    );
  } catch {
    return feedResult("tiktok", resolution.handle, "upstream_error", [], credential.source);
  }
}

// ---------------------------------------------------------------------------
// Instagram professional-account media. Live state is intentionally not
// inferred: Instagram Login has no live_media edge.
// ---------------------------------------------------------------------------

export async function fetchInstagramFeed(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
  options: { fresh?: boolean } = {},
): Promise<FeedItem[]> {
  const authorized = await fetchInstagramFeedResult(rawHandle, authorSlug, authorLabel, limit, options);
  return authorized.items.slice(0, limit);
}

/** Fetch Instagram media while preserving a token-free operator diagnostic. */
export async function fetchInstagramFeedResult(
  rawHandle: string,
  authorSlug: string | null = null,
  authorLabel = rawHandle,
  limit = 12,
  options: { fresh?: boolean } = {},
): Promise<OfficialSocialFeedResult> {
  const resolution = await resolveSocialCredential("instagram", rawHandle);
  const credential = resolution.credential;
  if (!credential) return feedResult("instagram", resolution.handle, resolution.state);
  if (limit <= 0) {
    return feedResult("instagram", resolution.handle, "empty", [], credential.source);
  }
  const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION ?? "")
    ? process.env.META_GRAPH_API_VERSION!
    : "v26.0";
  if (credential.instagramApi === "facebook" && !credential.providerUserId) {
    return feedResult("instagram", resolution.handle, "invalid_response", [], credential.source);
  }

  try {
    const base = credential.instagramApi === "facebook"
      ? `https://graph.facebook.com/${version}/${encodeURIComponent(credential.providerUserId!)}/media`
      : `https://graph.instagram.com/${version}/me/media`;
    const baseFields =
      "id,caption,media_type,media_product_type,media_url,permalink,thumbnail_url,timestamp,username";
    const params = new URLSearchParams({
      fields: `${baseFields},children{id,media_type,media_url,permalink,thumbnail_url,timestamp}`,
      limit: String(Math.max(1, Math.min(25, limit))),
    });
    const request = () => fetch(`${base}?${params}`, options.fresh
      ? {
          headers: { Authorization: `Bearer ${credential.accessToken}` },
          cache: "no-store",
        }
      : {
          headers: { Authorization: `Bearer ${credential.accessToken}` },
          next: { revalidate: SOCIAL_FEED_CACHE_SECONDS },
        });
    let res = await request();
    // Some older Graph versions/accounts reject nested child expansion. Keep
    // the post-level official response rather than dropping the whole source.
    if (!res.ok) {
      params.set("fields", baseFields);
      res = await request();
    }
    if (!res.ok) {
      return feedResult(
        "instagram",
        resolution.handle,
        httpFeedState(res.status),
        [],
        credential.source,
      );
    }
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{
        id?: string;
        caption?: string;
        media_type?: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
        media_product_type?: "AD" | "FEED" | "REELS" | "STORY";
        media_url?: string;
        permalink?: string;
        thumbnail_url?: string;
        timestamp?: string;
        children?: {
          data?: Array<{
            id?: string;
            media_type?: "IMAGE" | "VIDEO";
            media_url?: string;
            permalink?: string;
            thumbnail_url?: string;
            timestamp?: string;
          }>;
        };
      }>;
    } | null;
    if (!json || !Array.isArray(json.data)) {
      return feedResult("instagram", resolution.handle, "invalid_response", [], credential.source);
    }
    const items = json.data.flatMap((media): FeedItem[] => {
      if (!media.id || !media.permalink || !media.timestamp) return [];
      const parentPermalink = media.permalink;
      const parentTimestamp = isoTimestamp(media.timestamp);
      if (!parentTimestamp) return [];
      const parentIsReel =
        media.media_product_type === "REELS" ||
        /instagram\.com\/reels?\//i.test(parentPermalink);
      const children = media.children?.data ?? [];
      const entries = children.length
        ? children.map((child) => ({
            ...child,
            isReel:
              parentIsReel ||
              /instagram\.com\/reels?\//i.test(child.permalink ?? ""),
          }))
        : [{ ...media, isReel: parentIsReel }];
      return entries.flatMap((entry, index): FeedItem[] => {
        if (!entry.id) return [];
        const isVideo = entry.media_type === "VIDEO";
        const poster = entry.thumbnail_url ?? entry.media_url;
        const sourceUrl =
          entry.permalink ??
          (entries.length > 1 ? `${parentPermalink}?img_index=${index + 1}` : parentPermalink);
        const position = entries.length > 1 ? ` · ${index + 1}/${entries.length}` : "";
        return [{
          id: `ig-${entry.id}`,
          platform: "instagram",
          url: sourceUrl,
          sourceUrl,
          mediaUrl: isVideo ? entry.media_url : undefined,
          title: `${cleanTitle(media.caption, `${authorLabel} on Instagram`)}${position}`,
          publishedAt: isoTimestamp(entry.timestamp) ?? parentTimestamp,
          authorSlug,
          authorLabel,
          thumbnailUrl: poster,
          mediaType: isVideo ? "video" : "image",
          orientation: entry.isReel ? "portrait" : isVideo ? undefined : "square",
          format: isVideo ? (entry.isReel ? "short" : "long") : "photo",
          // Image posts use Instagram's official permalink embed on hover;
          // video posts keep the direct API media preview when available.
          previewStrategy: isVideo && entry.media_url ? "video" : "embed",
          embeddable: Boolean(entry.permalink ?? parentPermalink),
          focalPoint: CENTER,
          liveCapability: "unsupported",
        }];
      });
    });
    return feedResult(
      "instagram",
      resolution.handle,
      items.length ? "ok" : json.data.length ? "invalid_response" : "empty",
      items,
      credential.source,
    );
  } catch {
    return feedResult("instagram", resolution.handle, "upstream_error", [], credential.source);
  }
}

// ---------------------------------------------------------------------------
// Aggregator — merge-sort across platforms by publishedAt desc.
// ---------------------------------------------------------------------------

export type FeedRequest = {
  youtubeChannels: Array<{ channelId: string; authorSlug: string | null; authorLabel: string }>;
  xAccounts?: Array<{ handle: string; authorSlug: string | null; authorLabel: string }>;
  tiktokAccounts?: Array<{ handle: string; authorSlug: string | null; authorLabel: string }>;
  instagramAccounts?: Array<{ handle: string; authorSlug: string | null; authorLabel: string }>;
};

export async function fetchCombinedFeed(req: FeedRequest, limit = 12): Promise<FeedItem[]> {
  const sourceCount =
    req.youtubeChannels.length +
    (req.xAccounts?.length ?? 0) +
    (req.tiktokAccounts?.length ?? 0) +
    (req.instagramAccounts?.length ?? 0);
  const perSource = Math.max(6, Math.min(20, Math.ceil(limit / Math.max(1, sourceCount)) + 2));
  const tasks: Promise<FeedItem[]>[] = req.youtubeChannels.map((c) =>
    fetchYouTubeChannelFeed(c.channelId, c.authorSlug, c.authorLabel, perSource),
  );
  if (req.xAccounts?.length) {
    tasks.push(fetchXFeedsFromSnapshot(req.xAccounts, perSource));
  }
  for (const account of req.tiktokAccounts ?? []) {
    tasks.push(fetchTikTokFeed(account.handle, account.authorSlug, account.authorLabel, perSource));
  }
  for (const account of req.instagramAccounts ?? []) {
    tasks.push(fetchInstagramFeed(account.handle, account.authorSlug, account.authorLabel, perSource));
  }
  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return balancedFeedItems(all, limit);
}

// ---------------------------------------------------------------------------
// High-level feeds — HOUSE (all members) + CORE (group/org account).
// ---------------------------------------------------------------------------

/** Sort newest-first by ISO publishedAt; bad dates sink to the bottom. */
function byNewest(a: FeedItem, b: FeedItem): number {
  const ta = Date.parse(a.publishedAt);
  const tb = Date.parse(b.publishedAt);
  const sa = Number.isFinite(ta) ? ta : -Infinity;
  const sb = Number.isFinite(tb) ? tb : -Infinity;
  return sb - sa || a.id.localeCompare(b.id);
}

function canonicalFeedUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
}

/** Normalize dates and collapse duplicate ids/permalinks before any limit. */
function normalizeFeedItems(items: readonly FeedItem[]): FeedItem[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const output: FeedItem[] = [];
  for (const item of items) {
    const publishedAt = isoTimestamp(item.publishedAt);
    if (!publishedAt || seenIds.has(item.id)) continue;
    const source = canonicalFeedUrl(item.sourceUrl ?? item.url);
    const sourceKey = `${item.platform}:${source}`;
    if (source && seenUrls.has(sourceKey)) continue;
    seenIds.add(item.id);
    if (source) seenUrls.add(sourceKey);
    output.push({ ...item, publishedAt });
  }
  output.sort(byNewest);
  return output;
}

/**
 * Take sources in rounds before the final newest-first sort. A prolific X or
 * YouTube account therefore cannot push every item from another linked account
 * past a catalog limit.
 */
function balancedFeedItems(items: readonly FeedItem[], limit: number): FeedItem[] {
  if (limit <= 0) return [];
  const normalized = normalizeFeedItems(items);
  if (normalized.length <= limit) return normalized;

  const groups = new Map<string, FeedItem[]>();
  for (const item of normalized) {
    const key = `${item.authorSlug ?? "house"}:${item.platform}:${item.authorLabel}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const queues = [...groups.values()].sort((a, b) => byNewest(a[0]!, b[0]!));
  const selected: FeedItem[] = [];
  let round = 0;
  while (selected.length < limit) {
    let added = false;
    for (const queue of queues) {
      const item = queue[round];
      if (!item) continue;
      selected.push(item);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected.sort(byNewest);
}

/**
 * HOUSE feed — the latest across every member's socials, merged and
 * sorted newest-first. YouTube items are real (resolved from each
 * member's linked YouTube social via RSS. Other platforms use their
 * official credential-gated APIs. Never throws.
 */
async function loadHouseFeed(): Promise<FeedItem[]> {
  // Each member can run several YouTube channels (Marlon has 3); resolve
  // every linked YouTube social to its RSS feed in parallel. A handle's
  // bare login (e.g. "stableronaldoyt") works as a resolver ref too.
  const tasks: Promise<FeedItem[]>[] = [];
  for (const m of MEMBERS) {
    for (const s of m.socials) {
      if (s.platform !== "youtube") continue;
      const ref = s.url || s.handle || "";
      if (!ref) continue;
      const channelLabel = s.label?.trim();
      tasks.push(
        fetchYouTubeFeedByRef(
          ref,
          m.slug,
          channelLabel ? `${m.stageName} · ${channelLabel}` : m.stageName,
          12,
        ),
      );
    }
    for (const tk of m.socials.filter((s) => s.platform === "tiktok")) {
      if (tk.handle)
        tasks.push(fetchTikTokFeed(tk.handle, m.slug, `${m.stageName} · ${tk.handle}`, 16));
    }
    for (const ig of m.socials.filter((s) => s.platform === "instagram")) {
      if (ig.handle)
        tasks.push(fetchInstagramFeed(ig.handle, m.slug, `${m.stageName} · ${ig.handle}`, 16));
    }
  }
  const settled = await Promise.allSettled(tasks);
  const all: FeedItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);

  return balancedFeedItems(all, 512);
}

const cachedHouseFeed = unstable_cache(
  loadHouseFeed,
  ["coreboys", "social-feed", "house", "v1"],
  { revalidate: SOCIAL_FEED_CACHE_SECONDS, tags: [SOCIAL_FEED_CACHE_TAG] },
);

export async function getHouseFeed(limit = 24): Promise<FeedItem[]> {
  const [items, xItems] = await Promise.all([
    cachedHouseFeed(),
    // X remains snapshot-native and never makes a provider request on a
    // render. Its own short cache makes this database read shared too.
    getXFeedSnapshot(),
  ]);
  return balancedFeedItems([
    ...items,
    ...xItems.filter((item) => item.authorSlug !== null),
  ], Math.max(0, limit));
}

/**
 * CORE feed — the GROUP / org account's socials only. YouTube is real
 * via RSS (channel id, or official API handle resolution); TikTok,
 * Instagram uses its official fetcher; X comes from the durable snapshot.
 */
async function loadCoreFeed(): Promise<FeedItem[]> {
  const tasks: Promise<FeedItem[]>[] = [];

  const ytRef =
    GROUP.socials.youtube.channelId || GROUP.socials.youtube.url || GROUP.socials.youtube.handle;
  if (ytRef) tasks.push(fetchYouTubeFeedByRef(ytRef, null, GROUP.name, 15));

  if (GROUP.socials.tiktok?.handle)
    tasks.push(
      fetchTikTokFeed(
        GROUP.socials.tiktok.handle,
        null,
        `${GROUP.name} · ${GROUP.socials.tiktok.handle}`,
        24,
      ),
    );
  if (GROUP.socials.instagram?.handle)
    tasks.push(
      fetchInstagramFeed(
        GROUP.socials.instagram.handle,
        null,
        `${GROUP.name} · ${GROUP.socials.instagram.handle}`,
        24,
      ),
    );
  const settled = await Promise.allSettled(tasks);
  const all: FeedItem[] = [];
  for (const r of settled) if (r.status === "fulfilled") all.push(...r.value);

  return balancedFeedItems(all, 128);
}

const cachedCoreFeed = unstable_cache(
  loadCoreFeed,
  ["coreboys", "social-feed", "core", "v1"],
  { revalidate: SOCIAL_FEED_CACHE_SECONDS, tags: [SOCIAL_FEED_CACHE_TAG] },
);

export async function getCoreFeed(limit = 24): Promise<FeedItem[]> {
  const [items, xItems] = await Promise.all([
    cachedCoreFeed(),
    getXFeedSnapshot(),
  ]);
  return balancedFeedItems([
    ...items,
    ...xItems.filter((item) => item.authorSlug === null),
  ], Math.max(0, limit));
}
