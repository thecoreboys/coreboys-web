import "server-only";

import type { FeedItem } from "@/components/feed/types";
import { query } from "@/lib/db";
import {
  decodeXSocialArchiveCursor,
  encodeXSocialArchiveCursor,
} from "@/lib/x-social-archive-cursor";

type PersistedSocialProvider = "instagram" | "tiktok" | "x";
type PersistedContentType = "video" | "short" | "photo" | "post" | "live";

type PersistedSocialEventRow = {
  event_id?: string;
  provider: PersistedSocialProvider;
  member_slug: string | null;
  content_type: PersistedContentType;
  canonical_id: string;
  title: string;
  body: string | null;
  href: string;
  artwork_url: string | null;
  orientation: "landscape" | "portrait" | "square" | null;
  platform_payload: unknown;
  published_at: string;
};

type JsonRecord = Record<string, unknown>;

/**
 * Bounded high-water mark for the persisted TikTok/Instagram/X archive exposed
 * through public catalog reads. Ten thousand rows per ownership scope leaves
 * ample room for the six-month import without turning this into an unbounded
 * query as the durable event table keeps growing.
 */
export const PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT = 10_000;
export const X_SOCIAL_ARCHIVE_PAGE_SIZE = 48;

export type PersistedXSocialArchivePage = {
  items: FeedItem[];
  nextCursor: string | null;
};

function record(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function providerObjectId(row: PersistedSocialEventRow): string | null {
  const prefix = `${row.provider}:`;
  const canonical = row.canonical_id.toLowerCase().startsWith(prefix)
    ? row.canonical_id.slice(prefix.length).trim()
    : row.canonical_id.trim();
  if (canonical) return canonical;
  const pattern = row.provider === "tiktok"
    ? /\/video\/([^/?#]+)/i
    : row.provider === "x"
      ? /\/status\/(\d{5,25})/i
      : /\/(?:reel|reels|p|tv)\/([^/?#]+)/i;
  try {
    return new URL(row.href).pathname.match(pattern)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

function providerEmbedUrl(provider: PersistedSocialProvider, href: string, id: string): string | undefined {
  if (provider === "tiktok") {
    return /^\d{8,30}$/.test(id) ? `https://www.tiktok.com/player/v1/${id}` : undefined;
  }
  if (provider === "x") return undefined;
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    const match = /^\/(reel|reels|p|tv)\/([0-9A-Za-z_-]+)\/?$/i.exec(url.pathname);
    if ((host === "instagram.com" || host.endsWith(".instagram.com")) && match) {
      return `https://www.instagram.com/${match[1]}/${match[2]}/embed`;
    }
  } catch {
    // Invalid persisted links are skipped by the row mapper below.
  }
  return undefined;
}

function persistedFeedItem(row: PersistedSocialEventRow): FeedItem | null {
  const published = Date.parse(row.published_at);
  const id = providerObjectId(row);
  let sourceUrl: string;
  try {
    const url = new URL(row.href);
    if (url.protocol !== "https:") return null;
    sourceUrl = url.toString();
  } catch {
    return null;
  }
  if (!id || !Number.isFinite(published)) return null;

  const payload = record(row.platform_payload);
  const isX = row.provider === "x";
  const isPhoto = row.content_type === "photo";
  const isShort = row.content_type === "short" || row.provider === "tiktok";
  const embedUrl = providerEmbedUrl(row.provider, sourceUrl, id);
  const width = positiveNumber(payload.width);
  const height = positiveNumber(payload.height);
  const durationSeconds = positiveNumber(payload.durationSeconds);
  return {
    id: `${row.provider === "tiktok" ? "tt" : row.provider === "instagram" ? "ig" : "x"}-${id}`,
    canonicalProviderId: id,
    platform: row.provider,
    url: sourceUrl,
    sourceUrl,
    embedUrl,
    title: row.title,
    publishedAt: new Date(published).toISOString(),
    authorSlug: row.member_slug,
    authorLabel: string(payload.authorLabel) ?? row.body ?? (
      row.provider === "tiktok" ? "TikTok" : row.provider === "instagram" ? "Instagram" : "X"
    ),
    thumbnailUrl: row.artwork_url ?? undefined,
    mediaType: isX
      ? string(payload.mediaType) === "image"
        ? "image"
        : string(payload.mediaType) === "video"
          ? "video"
          : "text"
      : isPhoto ? "image" : "video",
    orientation: row.orientation ?? (isShort ? "portrait" : isPhoto ? "square" : "landscape"),
    width,
    height,
    format: isX ? undefined : isPhoto ? "photo" : isShort ? "short" : "long",
    previewStrategy: embedUrl ? "embed" : "external",
    embeddable: Boolean(embedUrl),
    focalPoint: { x: 0.5, y: 0.5 },
    durationSeconds,
    liveCapability: "unsupported",
  };
}

/**
 * Public render paths read the durable reconciliation snapshot instead of
 * invoking a paid provider API. TikTok/Instagram/X are selected so the
 * explicitly imported six-month archive remains visible even when a live
 * provider snapshot is paused or unavailable. YouTube and Twitch retain their
 * own render-safe sources.
 */
export async function getPersistedPublicSocialFeed(
  scope: "core" | "house",
  limit = 512,
): Promise<FeedItem[]> {
  const boundedLimit = Math.min(
    PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT,
    Math.max(0, Math.floor(limit)),
  );
  if (boundedLimit === 0) return [];
  const memberPredicate = scope === "core" ? "member_slug IS NULL" : "member_slug IS NOT NULL";
  const result = await query<PersistedSocialEventRow>(
    `SELECT provider,member_slug,content_type,canonical_id,title,body,href,artwork_url,orientation,
            platform_payload,published_at::text
       FROM social_content_events
      WHERE provider IN ('instagram','tiktok','x') AND ${memberPredicate}
      ORDER BY published_at DESC,created_at DESC
      LIMIT $1`,
    [boundedLimit],
  );
  return result.rows.flatMap((row) => {
    const item = persistedFeedItem(row);
    return item ? [item] : [];
  });
}

/**
 * Cursor-paged X history for one channel. Unlike the general Watch catalog,
 * this reads at most one 49-row database window and never calls X or Social
 * Fetch. The extra row answers only whether an older page exists.
 */
export async function getPersistedPublicXArchive(input: {
  memberSlug: string | null;
  before?: string | null;
  limit?: number;
}): Promise<PersistedXSocialArchivePage> {
  const requestedLimit = input.limit ?? X_SOCIAL_ARCHIVE_PAGE_SIZE;
  const pageSize = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(X_SOCIAL_ARCHIVE_PAGE_SIZE, Math.floor(requestedLimit)))
    : X_SOCIAL_ARCHIVE_PAGE_SIZE;
  const rawBefore = input.before?.trim() || null;
  const cursor = decodeXSocialArchiveCursor(rawBefore);
  if (rawBefore && !cursor) throw new Error("invalid_x_social_archive_cursor");

  const result = await query<PersistedSocialEventRow>(
    `SELECT id::text AS event_id,provider,member_slug,content_type,canonical_id,title,body,
            href,artwork_url,orientation,platform_payload,published_at::text
       FROM social_content_events
      WHERE provider='x'
        AND member_slug IS NOT DISTINCT FROM $1::text
        AND (
          $2::timestamptz IS NULL
          OR published_at < $2::timestamptz
          OR (published_at = $2::timestamptz AND id < $3::uuid)
        )
      ORDER BY published_at DESC,id DESC
      LIMIT $4`,
    [input.memberSlug, cursor?.publishedAt ?? null, cursor?.eventId ?? null, pageSize + 1],
  );

  const visibleRows = result.rows.slice(0, pageSize);
  const lastVisible = visibleRows.at(-1);
  const nextCursor = result.rows.length > pageSize && lastVisible?.event_id
    ? encodeXSocialArchiveCursor({
        publishedAt: lastVisible.published_at,
        eventId: lastVisible.event_id,
      })
    : null;
  return {
    items: visibleRows.flatMap((row) => {
      const item = persistedFeedItem(row);
      return item ? [item] : [];
    }),
    nextCursor,
  };
}
