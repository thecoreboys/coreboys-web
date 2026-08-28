/**
 * Server-side Social Fetch media adapter.
 *
 * Social Fetch reads public creator pages with one project API key, so the
 * creators do not need to authorize CORE. Callers should keep each platform's
 * official creator-token API authoritative and use these results only to fill
 * a missing or incomplete window.
 *
 * The provider charges per page. Next's data cache keeps TikTok videos,
 * Instagram posts, and Instagram Reels for two hours. Private Twitter pages
 * are reserved at their documented two-credit price and exist only for the
 * explicitly started historical job. The small in-flight map also coalesces
 * concurrent cache misses in one server process. This module never returns
 * direct CDN video URLs as durable
 * playback sources; consumers should construct provider-owned players from the
 * canonical ids/permalinks below.
 */

import {
  readSocialFetchCreditsCharged,
  socialFetchBudgetAdapter,
  type SocialFetchBudgetAdapter,
  type SocialFetchCreditReservationDenialReason,
} from "@/lib/social-fetch-budget";

const BASE_URL = "https://api.socialfetch.dev/v1";
const REQUEST_TIMEOUT_MS = 8_000;
export const SOCIAL_FETCH_MEDIA_CACHE_TAG = "social-fetch-media-v1";
export const SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS = 2 * 60 * 60;
export const SOCIAL_FETCH_REELS_REVALIDATE_SECONDS = 2 * 60 * 60;

export type SocialFetchMediaStatus =
  | "ok"
  | "not_configured"
  | "not_found"
  | "credits_exhausted"
  | "unauthorized"
  | "rate_limited"
  | "upstream_error"
  | "invalid_response";

export type SocialFetchDimensions = {
  width: number;
  height: number;
};

export type SocialFetchTikTokVideo = {
  id: string;
  caption: string | null;
  createdAt: string | null;
  /** Canonical TikTok permalink, never a Social Fetch or CDN URL. */
  sourceUrl: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  dimensions?: SocialFetchDimensions;
};

export type SocialFetchInstagramMediaType =
  | "image"
  | "video"
  | "sidecar"
  | "unknown";

export type SocialFetchInstagramMedia = {
  id: string;
  shortcode: string;
  mediaType: SocialFetchInstagramMediaType;
  caption: string | null;
  createdAt: string | null;
  /** Canonical Instagram permalink, never a Social Fetch or CDN URL. */
  sourceUrl: string;
  /** Provider-owned iframe URL derived from the canonical permalink. */
  embedUrl: string;
  thumbnailUrl?: string;
  dimensions?: SocialFetchDimensions;
  surface: "post" | "reel";
};

export type SocialFetchTwitterTweet = {
  id: string;
  text: string;
  createdAt: string | null;
  /** Canonical X permalink, never a Social Fetch or CDN URL. */
  sourceUrl: string;
  thumbnailUrl?: string;
  dimensions?: SocialFetchDimensions;
  mediaType: "photo" | "video" | "text";
  isReply: boolean;
  isRetweet: boolean;
};

export type SocialFetchMediaResult<T> = {
  status: SocialFetchMediaStatus;
  items: T[];
  /** Social Fetch's public-profile lookup diagnostic, when supplied. */
  lookupStatus: string | null;
};

export type SocialFetchMediaPage = {
  nextCursor: string | null;
  hasMore: boolean;
};

/** Private/background page result. Operational flags must never reach UI. */
export type SocialFetchPrivateMediaPageResult<T> = SocialFetchMediaResult<T> & {
  page: SocialFetchMediaPage;
  rawItemCount: number;
  providerRequestMade: boolean;
  committedCredits: number;
  budgetDenied: boolean;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(nonEmptyString(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizedHandle(rawHandle: string): string | null {
  const handle = rawHandle.trim().replace(/^@+/, "").toLowerCase();
  // TikTok and Instagram handles use this common subset. Rejecting everything
  // else prevents a malformed roster entry from becoming an API path.
  return handle && /^[a-z0-9._]{1,64}$/.test(handle) ? handle : null;
}

function normalizedTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1_000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const text = nonEmptyString(value);
  if (!text) return null;
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
}

function safeHttpsUrl(value: unknown): string | undefined {
  const text = nonEmptyString(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function dimensionsFrom(value: unknown, depth = 0): SocialFetchDimensions | undefined {
  if (depth > 3) return undefined;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = dimensionsFrom(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const object = record(value);
  if (!object) return undefined;
  const width = positiveNumber(object.width);
  const height = positiveNumber(object.height);
  if (width && height) return { width, height };
  for (const key of ["dimensions", "media", "video"]) {
    const found = dimensionsFrom(object[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function responseStatus(status: number): SocialFetchMediaStatus {
  if (status === 402) return "credits_exhausted";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream_error";
  return "invalid_response";
}

let budgetAdapter: SocialFetchBudgetAdapter = socialFetchBudgetAdapter;

/**
 * A denied paid refresh is operational state for admins, not public content.
 * Returning a neutral empty window keeps durable posts and official embeds in
 * place without exposing pause/cap/billing language to visitors.
 */
export function socialFetchBudgetDenialMediaStatus(
  _reason: SocialFetchCreditReservationDenialReason,
): SocialFetchMediaStatus {
  return "ok";
}

/** Test seam: production always uses the durable database adapter above. */
export function setSocialFetchBudgetAdapterForTests(
  adapter: SocialFetchBudgetAdapter | null,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Social Fetch budget adapter cannot be replaced in production.");
  }
  budgetAdapter = adapter ?? socialFetchBudgetAdapter;
}

type SocialFetchJsonResponse = {
  status: SocialFetchMediaStatus;
  body: unknown;
  budgetDenied?: true;
  providerRequestMade: boolean;
  committedCredits: number;
};

const inFlight = new Map<string, Promise<SocialFetchJsonResponse>>();

async function requestJson(
  endpoint: string,
  revalidate: number,
  options: { privatePage?: boolean; feature?: string; estimatedCredits?: number } = {},
): Promise<SocialFetchJsonResponse> {
  const apiKey = process.env.SOCIAL_FETCH_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "not_configured",
      body: null,
      providerRequestMade: false,
      committedCredits: 0,
    };
  }

  const cacheKey = `${options.privatePage ? "private" : revalidate}:${endpoint}`;
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async () => {
    const estimatedCredits = options.estimatedCredits ?? 1;
    const reservation = await budgetAdapter.reserve({
      feature: options.feature ?? "public_media",
      requestKey: endpoint,
      estimatedCredits,
    });
    if (!reservation.ok) {
      return {
        status: socialFetchBudgetDenialMediaStatus(reservation.reason),
        body: null,
        budgetDenied: true as const,
        providerRequestMade: false,
        committedCredits: 0,
      };
    }

    let reportedCredits: number | null = null;
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
        ...(options.privatePage
          ? { cache: "no-store" as const }
          : {
              next: {
                revalidate,
                tags: [SOCIAL_FETCH_MEDIA_CACHE_TAG],
              },
            }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = await response.json().catch(() => null);
      reportedCredits = readSocialFetchCreditsCharged(body);
      const committedCredits = reportedCredits ?? estimatedCredits;
      if (!response.ok) {
        return {
          status: responseStatus(response.status),
          body: null,
          providerRequestMade: true,
          committedCredits,
        };
      }
      return body === null
        ? {
            status: "invalid_response" as const,
            body: null,
            providerRequestMade: true,
            committedCredits,
          }
        : {
            status: "ok" as const,
            body,
            providerRequestMade: true,
            committedCredits,
          };
    } catch {
      return {
        status: "upstream_error" as const,
        body: null,
        providerRequestMade: true,
        committedCredits: estimatedCredits,
      };
    } finally {
      await budgetAdapter.settle(reservation.reservationId, reportedCredits).catch((error) => {
        // The unresolved reservation remains committed, which is the safe
        // failure mode for the monthly cap if bookkeeping is unavailable.
        console.error("[social-fetch-budget] media settlement failed", error);
      });
    }
  })();
  inFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey);
  }
}

function lookupStatusFrom(data: JsonRecord): string | null {
  return nonEmptyString(data.lookupStatus);
}

function lookupFailureStatus(lookupStatus: string | null): SocialFetchMediaStatus | null {
  if (!lookupStatus) return null;
  if (/not[_ -]?found|missing|unavailable/i.test(lookupStatus)) return "not_found";
  if (/credit|payment|quota/i.test(lookupStatus)) return "credits_exhausted";
  if (/rate|throttl/i.test(lookupStatus)) return "rate_limited";
  if (/error|fail/i.test(lookupStatus)) return "upstream_error";
  return null;
}

function cursorValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function mediaPageFrom(data: JsonRecord): SocialFetchMediaPage | null {
  const page = record(data.page);
  if (!page || typeof page.hasMore !== "boolean") return null;
  return {
    nextCursor: cursorValue(page.nextCursor),
    hasMore: page.hasMore,
  };
}

function endpointWithCursor(endpoint: string, cursor: string | null | undefined): string {
  const normalized = cursor?.trim();
  if (!normalized) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}cursor=${encodeURIComponent(normalized)}`;
}

function privatePageFailure<T>(
  response: SocialFetchJsonResponse,
  lookupStatus: string | null = null,
): SocialFetchPrivateMediaPageResult<T> {
  return {
    status: response.status,
    items: [],
    lookupStatus,
    page: { nextCursor: null, hasMore: false },
    rawItemCount: 0,
    providerRequestMade: response.providerRequestMade,
    committedCredits: response.committedCredits,
    budgetDenied: Boolean(response.budgetDenied),
  };
}

function tiktokVideo(value: unknown, handle: string): SocialFetchTikTokVideo | null {
  const item = record(value);
  if (!item) return null;
  const id = nonEmptyString(item.id);
  if (!id || !/^\d{8,30}$/.test(id)) return null;
  const durationMs = positiveNumber(item.durationMs);
  return {
    id,
    caption: nonEmptyString(item.caption),
    createdAt: normalizedTimestamp(item.createdAt),
    sourceUrl: `https://www.tiktok.com/@${handle}/video/${id}`,
    thumbnailUrl: safeHttpsUrl(item.thumbnailUrl),
    durationSeconds: durationMs ? durationMs / 1_000 : undefined,
    dimensions: dimensionsFrom(item),
  };
}

/** Read one cached page of public TikTok videos without creator OAuth. */
export async function fetchSocialFetchTikTokVideos(
  rawHandle: string,
  limit = 24,
): Promise<SocialFetchMediaResult<SocialFetchTikTokVideo>> {
  const handle = normalizedHandle(rawHandle);
  if (!handle || limit <= 0) {
    return { status: handle ? "ok" : "not_found", items: [], lookupStatus: null };
  }
  const response = await requestJson(
    `/tiktok/profiles/${encodeURIComponent(handle)}/videos`,
    SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS,
  );
  if (response.budgetDenied) {
    return { status: response.status, items: [], lookupStatus: null };
  }
  if (response.status !== "ok") {
    return { status: response.status, items: [], lookupStatus: null };
  }
  const data = record(record(response.body)?.data);
  if (!data || !Array.isArray(data.videos)) {
    return { status: "invalid_response", items: [], lookupStatus: data ? lookupStatusFrom(data) : null };
  }
  const lookupStatus = lookupStatusFrom(data);
  const items = data.videos
    .flatMap((value) => {
      const video = tiktokVideo(value, handle);
      return video ? [video] : [];
    })
    .slice(0, Math.max(0, Math.floor(limit)));
  return {
    status: items.length
      ? "ok"
      : data.videos.length
        ? "invalid_response"
        : lookupFailureStatus(lookupStatus) ?? "ok",
    items,
    lookupStatus,
  };
}

/** Cursor-aware private page for the authenticated historical backfill job. */
export async function fetchSocialFetchTikTokVideosPage(
  rawHandle: string,
  cursor: string | null = null,
): Promise<SocialFetchPrivateMediaPageResult<SocialFetchTikTokVideo>> {
  const handle = normalizedHandle(rawHandle);
  if (!handle) {
    return {
      status: "not_found",
      items: [],
      lookupStatus: null,
      page: { nextCursor: null, hasMore: false },
      rawItemCount: 0,
      providerRequestMade: false,
      committedCredits: 0,
      budgetDenied: false,
    };
  }
  const response = await requestJson(
    endpointWithCursor(`/tiktok/profiles/${encodeURIComponent(handle)}/videos?sortBy=latest`, cursor),
    0,
    { privatePage: true, feature: "six_month_backfill" },
  );
  if (response.status !== "ok" || response.budgetDenied) {
    return privatePageFailure(response);
  }
  const data = record(record(response.body)?.data);
  if (!data || !Array.isArray(data.videos)) {
    return privatePageFailure({ ...response, status: "invalid_response" });
  }
  const page = mediaPageFrom(data);
  if (!page) return privatePageFailure({ ...response, status: "invalid_response" });
  const items = data.videos.flatMap((value) => {
    const video = tiktokVideo(value, handle);
    return video ? [video] : [];
  });
  const lookupStatus = lookupStatusFrom(data);
  const invalidItems = items.length !== data.videos.length
    || items.some((item) => item.createdAt === null);
  return {
    status: invalidItems
      ? "invalid_response"
      : lookupFailureStatus(lookupStatus) ?? "ok",
    items,
    lookupStatus,
    page,
    rawItemCount: data.videos.length,
    providerRequestMade: response.providerRequestMade,
    committedCredits: response.committedCredits,
    budgetDenied: false,
  };
}

function instagramShortcode(value: unknown): string | null {
  const shortcode = nonEmptyString(value);
  return shortcode && /^[0-9A-Za-z_-]{4,32}$/.test(shortcode) ? shortcode : null;
}

function instagramSourceUrl(shortcode: string, candidate: unknown, surface: "post" | "reel"): string {
  const provided = safeHttpsUrl(candidate);
  if (provided) {
    try {
      const url = new URL(provided);
      const host = url.hostname.toLowerCase();
      const match = /^\/(?:reel|reels|p|tv)\/([0-9A-Za-z_-]+)\/?$/i.exec(url.pathname);
      if ((host === "instagram.com" || host.endsWith(".instagram.com")) && match?.[1] === shortcode) {
        return `https://www.instagram.com/${match[0].split("/")[1]}/${shortcode}/`;
      }
    } catch {
      // Fall through to the canonical URL derived from the documented id.
    }
  }
  return `https://www.instagram.com/${surface === "reel" ? "reel" : "p"}/${shortcode}/`;
}

function instagramMedia(
  value: unknown,
  surface: "post" | "reel",
): SocialFetchInstagramMedia | null {
  const item = record(value);
  if (!item) return null;
  const shortcode = instagramShortcode(item.shortcode);
  const rawId = nonEmptyString(item.id);
  if (!shortcode || !rawId || !/^[0-9A-Za-z_-]{4,128}$/.test(rawId)) return null;
  const rawMediaType = nonEmptyString(item.mediaType)?.toLowerCase();
  const mediaType: SocialFetchInstagramMediaType =
    rawMediaType === "image" || rawMediaType === "video" || rawMediaType === "sidecar"
      ? rawMediaType
      : "unknown";
  const sourceUrl = instagramSourceUrl(shortcode, item.url, surface);
  return {
    id: rawId,
    shortcode,
    mediaType,
    caption: nonEmptyString(item.caption),
    createdAt: normalizedTimestamp(item.createdAt),
    sourceUrl,
    embedUrl: `${sourceUrl}embed`,
    // CDN URLs are accepted only as disposable artwork. videoUrl/displayUrl
    // are deliberately never promoted to a durable playback mediaUrl.
    thumbnailUrl: safeHttpsUrl(item.thumbnailUrl) ?? safeHttpsUrl(item.displayUrl),
    dimensions: dimensionsFrom(item.dimensions),
    surface,
  };
}

async function fetchInstagramEndpoint(
  rawHandle: string,
  surface: "post" | "reel",
  limit: number,
): Promise<SocialFetchMediaResult<SocialFetchInstagramMedia>> {
  const handle = normalizedHandle(rawHandle);
  if (!handle || limit <= 0) {
    return { status: handle ? "ok" : "not_found", items: [], lookupStatus: null };
  }
  const collection = surface === "reel" ? "reels" : "posts";
  const response = await requestJson(
    `/instagram/profiles/${encodeURIComponent(handle)}/${collection}`,
    surface === "reel"
      ? SOCIAL_FETCH_REELS_REVALIDATE_SECONDS
      : SOCIAL_FETCH_PROFILE_MEDIA_REVALIDATE_SECONDS,
  );
  if (response.budgetDenied) {
    return { status: response.status, items: [], lookupStatus: null };
  }
  if (response.status !== "ok") {
    return { status: response.status, items: [], lookupStatus: null };
  }
  const data = record(record(response.body)?.data);
  const values = data?.[collection];
  if (!data || !Array.isArray(values)) {
    return { status: "invalid_response", items: [], lookupStatus: data ? lookupStatusFrom(data) : null };
  }
  const lookupStatus = lookupStatusFrom(data);
  const items = values
    .flatMap((value) => {
      const media = instagramMedia(value, surface);
      return media ? [media] : [];
    })
    .slice(0, Math.max(0, Math.floor(limit)));
  return {
    status: items.length
      ? "ok"
      : values.length
        ? "invalid_response"
        : lookupFailureStatus(lookupStatus) ?? "ok",
    items,
    lookupStatus,
  };
}

/** Read one cached public Instagram posts/photos page without creator OAuth. */
export function fetchSocialFetchInstagramPosts(
  rawHandle: string,
  limit = 24,
): Promise<SocialFetchMediaResult<SocialFetchInstagramMedia>> {
  return fetchInstagramEndpoint(rawHandle, "post", limit);
}

/** Read the separately cached public Instagram Reels page without creator OAuth. */
export function fetchSocialFetchInstagramReels(
  rawHandle: string,
  limit = 24,
): Promise<SocialFetchMediaResult<SocialFetchInstagramMedia>> {
  return fetchInstagramEndpoint(rawHandle, "reel", limit);
}

async function fetchSocialFetchInstagramPage(
  rawHandle: string,
  surface: "post" | "reel",
  cursor: string | null,
): Promise<SocialFetchPrivateMediaPageResult<SocialFetchInstagramMedia>> {
  const handle = normalizedHandle(rawHandle);
  if (!handle) {
    return {
      status: "not_found",
      items: [],
      lookupStatus: null,
      page: { nextCursor: null, hasMore: false },
      rawItemCount: 0,
      providerRequestMade: false,
      committedCredits: 0,
      budgetDenied: false,
    };
  }
  const collection = surface === "reel" ? "reels" : "posts";
  const response = await requestJson(
    endpointWithCursor(`/instagram/profiles/${encodeURIComponent(handle)}/${collection}`, cursor),
    0,
    { privatePage: true, feature: "six_month_backfill" },
  );
  if (response.status !== "ok" || response.budgetDenied) {
    return privatePageFailure(response);
  }
  const data = record(record(response.body)?.data);
  const values = data?.[collection];
  if (!data || !Array.isArray(values)) {
    return privatePageFailure(
      { ...response, status: "invalid_response" },
      data ? lookupStatusFrom(data) : null,
    );
  }
  const page = mediaPageFrom(data);
  if (!page) {
    return privatePageFailure(
      { ...response, status: "invalid_response" },
      lookupStatusFrom(data),
    );
  }
  const items = values.flatMap((value) => {
    const media = instagramMedia(value, surface);
    return media ? [media] : [];
  });
  const lookupStatus = lookupStatusFrom(data);
  const invalidItems = items.length !== values.length
    || items.some((item) => item.createdAt === null);
  return {
    status: invalidItems
      ? "invalid_response"
      : lookupFailureStatus(lookupStatus) ?? "ok",
    items,
    lookupStatus,
    page,
    rawItemCount: values.length,
    providerRequestMade: response.providerRequestMade,
    committedCredits: response.committedCredits,
    budgetDenied: false,
  };
}

/** Cursor-aware private Instagram posts/photos page for historical backfill. */
export function fetchSocialFetchInstagramPostsPage(
  rawHandle: string,
  cursor: string | null = null,
): Promise<SocialFetchPrivateMediaPageResult<SocialFetchInstagramMedia>> {
  return fetchSocialFetchInstagramPage(rawHandle, "post", cursor);
}

/** Cursor-aware private Instagram Reels page for historical backfill. */
export function fetchSocialFetchInstagramReelsPage(
  rawHandle: string,
  cursor: string | null = null,
): Promise<SocialFetchPrivateMediaPageResult<SocialFetchInstagramMedia>> {
  return fetchSocialFetchInstagramPage(rawHandle, "reel", cursor);
}

function normalizedTwitterHandle(rawHandle: string): string | null {
  const handle = rawHandle.trim().replace(/^@+/, "");
  return /^[a-z0-9_]{1,15}$/i.test(handle) ? handle : null;
}

function twitterSourceUrl(id: string, requestedHandle: string): string {
  return `https://x.com/${requestedHandle}/status/${id}`;
}

function twitterTweet(value: unknown, requestedHandle: string): SocialFetchTwitterTweet | null {
  const item = record(value);
  if (!item) return null;
  const id = nonEmptyString(item.id);
  if (!id || !/^\d{5,25}$/.test(id) || typeof item.text !== "string") return null;
  if (!Array.isArray(item.media) || typeof item.isRetweet !== "boolean") return null;
  if (item.isReply !== undefined && typeof item.isReply !== "boolean") return null;
  const author = item.author === null ? null : record(item.author);
  if (item.author !== null && !author) return null;
  const authorHandle = author ? normalizedTwitterHandle(nonEmptyString(author.handle) ?? "") : null;
  // Profile pages must never be able to drift a returned authored post into
  // another member's channel. Retweets are discarded by persistence below.
  if (!item.isRetweet && authorHandle?.toLowerCase() !== requestedHandle.toLowerCase()) return null;

  const parsedMedia = item.media.map((value) => {
    const media = record(value);
    const type = nonEmptyString(media?.type)?.toLowerCase();
    const url = safeHttpsUrl(media?.url);
    if (!media || (type !== "photo" && type !== "video") || !url) return null;
    return {
      type,
      url,
      thumbnailUrl: safeHttpsUrl(media.thumbnailUrl),
      dimensions: dimensionsFrom(media),
    } as const;
  });
  if (parsedMedia.some((media) => media === null)) return null;
  const firstMedia = parsedMedia[0];
  const mediaType = firstMedia?.type ?? "text";
  const inReplyToStatusId = item.inReplyToStatusId;
  if (inReplyToStatusId !== null && inReplyToStatusId !== undefined
    && !nonEmptyString(inReplyToStatusId)) return null;

  return {
    id,
    text: item.text,
    createdAt: normalizedTimestamp(item.createdAt),
    sourceUrl: twitterSourceUrl(id, requestedHandle),
    thumbnailUrl: firstMedia?.thumbnailUrl
      ?? (firstMedia?.type === "photo" ? firstMedia.url : undefined),
    dimensions: firstMedia?.dimensions,
    mediaType,
    isReply: item.isReply === true || Boolean(nonEmptyString(inReplyToStatusId)),
    isRetweet: item.isRetweet,
  };
}

/**
 * Cursor-aware private X page for the authenticated historical backfill job.
 * Social Fetch documents this route at two credits, including normalization
 * failures, so two credits are reserved before any network request.
 */
export async function fetchSocialFetchTwitterTweetsPage(
  rawHandle: string,
  cursor: string | null = null,
): Promise<SocialFetchPrivateMediaPageResult<SocialFetchTwitterTweet>> {
  const handle = normalizedTwitterHandle(rawHandle);
  if (!handle) {
    return {
      status: "not_found",
      items: [],
      lookupStatus: null,
      page: { nextCursor: null, hasMore: false },
      rawItemCount: 0,
      providerRequestMade: false,
      committedCredits: 0,
      budgetDenied: false,
    };
  }
  const base = `/twitter/profiles/${encodeURIComponent(handle)}/tweets?limit=100&includeReplies=false&includePinned=false`;
  const response = await requestJson(endpointWithCursor(base, cursor), 0, {
    privatePage: true,
    feature: "six_month_backfill",
    estimatedCredits: 2,
  });
  if (response.status !== "ok" || response.budgetDenied) {
    return privatePageFailure(response);
  }
  const data = record(record(response.body)?.data);
  if (!data || !Array.isArray(data.tweets)) {
    return privatePageFailure(
      { ...response, status: "invalid_response" },
      data ? lookupStatusFrom(data) : null,
    );
  }
  const page = mediaPageFrom(data);
  if (!page) {
    return privatePageFailure(
      { ...response, status: "invalid_response" },
      lookupStatusFrom(data),
    );
  }
  const lookupStatus = lookupStatusFrom(data);
  const items = data.tweets.flatMap((value) => {
    const tweet = twitterTweet(value, handle);
    return tweet ? [tweet] : [];
  });
  const invalidItems = items.length !== data.tweets.length
    || items.some((item) => item.createdAt === null);
  const lookupFailure = lookupFailureStatus(lookupStatus);
  return {
    status: invalidItems || (lookupStatus !== "found" && lookupStatus !== "not_found")
      ? "invalid_response"
      : lookupFailure ?? "ok",
    items,
    lookupStatus,
    page,
    rawItemCount: data.tweets.length,
    providerRequestMade: response.providerRequestMade,
    committedCredits: response.committedCredits,
    budgetDenied: false,
  };
}
