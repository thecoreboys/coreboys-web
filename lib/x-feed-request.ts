import type {
  FeedItem,
  XFeedEntities,
} from "@/components/feed/types";

export const X_RECENT_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/recent";
export const X_FULL_ARCHIVE_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/all";
export const X_RECENT_SEARCH_TIMEOUT_MS = 10_000;

export type XFeedAccount = {
  handle: string;
  authorSlug: string | null;
  authorLabel: string;
};

export type XFeedFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type XMedia = {
  media_key: string;
  type: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  variants?: Array<{ bit_rate?: number; content_type?: string; url?: string }>;
};

type XUser = {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
  description?: string;
  url?: string;
  verified?: boolean;
  verified_type?: string;
};

type XPost = {
  id: string;
  author_id: string;
  community_id?: string;
  text: string;
  created_at: string;
  attachments?: { media_keys?: string[] };
  entities?: XFeedEntities;
  note_tweet?: {
    text: string;
    entities?: XFeedEntities;
  };
  referenced_tweets?: Array<{
    type: "quoted" | "replied_to" | "retweeted";
    id: string;
  }>;
};

type XRecentSearchResponse = {
  data?: XPost[];
  includes?: {
    users?: XUser[];
    media?: XMedia[];
    tweets?: XPost[];
  };
  meta?: {
    result_count?: number;
    next_token?: string;
  };
};

const CENTER = { x: 0.5, y: 0.5 } as const;
const inflightByFetcher = new WeakMap<
  XFeedFetch,
  Map<string, Promise<XRecentSearchResponse>>
>();

export class XFeedUpstreamError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "XFeedUpstreamError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeXHandle(raw: string): string | null {
  const handle = raw.trim().replace(/^@+/, "");
  return /^[a-z0-9_]{1,15}$/i.test(handle) ? handle : null;
}

export function normalizeXFeedAccounts(
  accounts: readonly XFeedAccount[],
): XFeedAccount[] {
  const byHandle = new Map<string, XFeedAccount>();
  for (const account of accounts) {
    const handle = normalizeXHandle(account.handle);
    const authorLabel = account.authorLabel.trim();
    if (!handle || !authorLabel) continue;
    const key = handle.toLowerCase();
    if (!byHandle.has(key)) {
      byHandle.set(key, { ...account, handle, authorLabel });
    }
  }
  return [...byHandle.values()].sort((a, b) =>
    a.handle.toLowerCase().localeCompare(b.handle.toLowerCase()),
  );
}

export function buildXRecentSearchUrl(
  accounts: readonly XFeedAccount[],
  perAccountLimit = 12,
): string | null {
  const normalized = normalizeXFeedAccounts(accounts);
  if (normalized.length === 0) return null;
  const cap = Math.max(1, Math.min(100, Math.trunc(perAccountLimit)));
  const query = `(${normalized.map((account) => `from:${account.handle}`).join(" OR ")}) -is:reply -is:retweet`;
  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(100, normalized.length * cap))),
    "tweet.fields": "attachments,author_id,community_id,created_at,entities,note_tweet,referenced_tweets",
    expansions: "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.author_id",
    "media.fields": "duration_ms,height,media_key,preview_image_url,type,url,variants,width",
    "user.fields": "description,id,name,profile_image_url,url,username,verified,verified_type",
  });
  return `${X_RECENT_SEARCH_ENDPOINT}?${params}`;
}

/** Build a compliant full-archive query for an explicit historical window. */
export function buildXFullArchiveSearchUrl(
  accounts: readonly XFeedAccount[],
  startTime: string,
  nextToken?: string,
): string | null {
  const normalized = normalizeXFeedAccounts(accounts);
  if (normalized.length === 0 || !isoTimestamp(startTime)) return null;
  const query = `(${normalized.map((account) => `from:${account.handle}`).join(" OR ")}) -is:reply -is:retweet`;
  const params = new URLSearchParams({
    query,
    start_time: new Date(startTime).toISOString(),
    max_results: "500",
    "tweet.fields": "attachments,author_id,community_id,created_at,entities,note_tweet,referenced_tweets",
    expansions: "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.author_id",
    "media.fields": "duration_ms,height,media_key,preview_image_url,type,url,variants,width",
    "user.fields": "description,id,name,profile_image_url,url,username,verified,verified_type",
  });
  if (nextToken) params.set("next_token", nextToken);
  return `${X_FULL_ARCHIVE_SEARCH_ENDPOINT}?${params}`;
}

function mediaOrientation(width?: number, height?: number) {
  if (!width || !height) return undefined;
  const ratio = width / height;
  if (ratio > 1.08) return "landscape" as const;
  if (ratio < 0.92) return "portrait" as const;
  return "square" as const;
}

function xVideoUrl(media: XMedia): string | undefined {
  return media.variants
    ?.filter((variant) => variant.content_type === "video/mp4" && variant.url)
    .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]?.url;
}

function formatDurationSeconds(totalSeconds: number): string {
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

function isoTimestamp(raw: string): string | null {
  const value = Date.parse(raw);
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function assertEntities(value: unknown, field: string): asserts value is XFeedEntities {
  if (!isRecord(value)) {
    throw new XFeedUpstreamError(`X recent search returned malformed ${field}`);
  }
}

function parseXPost(value: unknown): XPost {
  if (!isRecord(value)) {
    throw new XFeedUpstreamError("X recent search returned a malformed post");
  }
  const { id, author_id: authorId, text, created_at: createdAt } = value;
  if (
    typeof id !== "string" || !id ||
    typeof authorId !== "string" || !authorId ||
    typeof text !== "string" ||
    typeof createdAt !== "string" || !isoTimestamp(createdAt)
  ) {
    throw new XFeedUpstreamError("X recent search returned a malformed post");
  }

  let attachments: XPost["attachments"];
  if (value.attachments !== undefined) {
    if (!isRecord(value.attachments)) {
      throw new XFeedUpstreamError("X recent search returned malformed attachments");
    }
    const mediaKeys = value.attachments.media_keys;
    if (mediaKeys !== undefined && (
      !Array.isArray(mediaKeys) || mediaKeys.some((key) => typeof key !== "string")
    )) {
      throw new XFeedUpstreamError("X recent search returned malformed media keys");
    }
    attachments = { media_keys: mediaKeys as string[] | undefined };
  }

  let entities: XFeedEntities | undefined;
  if (value.entities !== undefined) {
    assertEntities(value.entities, "entities");
    entities = value.entities;
  }

  let noteTweet: XPost["note_tweet"];
  if (value.note_tweet !== undefined) {
    if (!isRecord(value.note_tweet) || typeof value.note_tweet.text !== "string") {
      throw new XFeedUpstreamError("X recent search returned a malformed note tweet");
    }
    let noteEntities: XFeedEntities | undefined;
    if (value.note_tweet.entities !== undefined) {
      assertEntities(value.note_tweet.entities, "note tweet entities");
      noteEntities = value.note_tweet.entities;
    }
    noteTweet = { text: value.note_tweet.text, entities: noteEntities };
  }

  let referencedTweets: XPost["referenced_tweets"];
  if (value.referenced_tweets !== undefined) {
    if (!Array.isArray(value.referenced_tweets) || value.referenced_tweets.some((reference) => (
      !isRecord(reference) ||
      (reference.type !== "quoted" && reference.type !== "replied_to" && reference.type !== "retweeted") ||
      typeof reference.id !== "string" || !/^\d{5,25}$/.test(reference.id)
    ))) {
      throw new XFeedUpstreamError("X recent search returned malformed referenced tweets");
    }
    referencedTweets = value.referenced_tweets as XPost["referenced_tweets"];
  }

  const communityId = value.community_id;
  if (
    communityId !== undefined &&
    (typeof communityId !== "string" || !/^\d{5,25}$/.test(communityId))
  ) {
    throw new XFeedUpstreamError("X recent search returned a malformed Community id");
  }

  return {
    id,
    author_id: authorId,
    community_id: communityId as string | undefined,
    text,
    created_at: createdAt,
    attachments,
    entities,
    note_tweet: noteTweet,
    referenced_tweets: referencedTweets,
  };
}

function parseXUser(value: unknown): XUser {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
    throw new XFeedUpstreamError("X recent search returned a malformed user");
  }
  const username = typeof value.username === "string"
    ? normalizeXHandle(value.username)
    : null;
  if (!username) {
    throw new XFeedUpstreamError("X recent search returned a malformed user");
  }
  return {
    id: value.id,
    username,
    name: typeof value.name === "string" ? value.name : undefined,
    profile_image_url: typeof value.profile_image_url === "string"
      ? value.profile_image_url
      : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    url: typeof value.url === "string" ? value.url : undefined,
    verified: typeof value.verified === "boolean" ? value.verified : undefined,
    verified_type: typeof value.verified_type === "string" ? value.verified_type : undefined,
  };
}

function parseXMedia(value: unknown): XMedia {
  if (
    !isRecord(value) ||
    typeof value.media_key !== "string" || !value.media_key ||
    (value.type !== "photo" && value.type !== "video" && value.type !== "animated_gif")
  ) {
    throw new XFeedUpstreamError("X recent search returned malformed media");
  }
  const variants = value.variants;
  if (variants !== undefined && !Array.isArray(variants)) {
    throw new XFeedUpstreamError("X recent search returned malformed media variants");
  }
  return value as XMedia;
}

export function parseXRecentSearchResponse(
  payload: unknown,
  accounts: readonly XFeedAccount[],
  perAccountLimit = 12,
): FeedItem[] {
  if (!isRecord(payload)) {
    throw new XFeedUpstreamError("X recent search returned malformed JSON");
  }
  const response = payload as XRecentSearchResponse;
  if (response.data === undefined) {
    if (isRecord(response.meta) && response.meta.result_count === 0) return [];
    throw new XFeedUpstreamError("X recent search response is missing data");
  }
  if (!Array.isArray(response.data)) {
    throw new XFeedUpstreamError("X recent search returned malformed data");
  }
  if (response.data.length === 0) return [];
  if (!isRecord(response.includes) || !Array.isArray(response.includes.users)) {
    throw new XFeedUpstreamError("X recent search response is missing expanded users");
  }
  if (response.includes.media !== undefined && !Array.isArray(response.includes.media)) {
    throw new XFeedUpstreamError("X recent search returned malformed expanded media");
  }
  if (response.includes.tweets !== undefined && !Array.isArray(response.includes.tweets)) {
    throw new XFeedUpstreamError("X recent search returned malformed referenced tweets");
  }

  const normalized = normalizeXFeedAccounts(accounts);
  const accountByHandle = new Map(
    normalized.map((account) => [account.handle.toLowerCase(), account]),
  );
  const users = response.includes.users.map(parseXUser);
  const userById = new Map(users.map((user) => [user.id, user]));
  const media = (response.includes.media ?? []).map(parseXMedia);
  const mediaByKey = new Map(media.map((item) => [item.media_key, item]));
  const referencedPosts = (response.includes.tweets ?? []).map(parseXPost);
  const referencedPostById = new Map(referencedPosts.map((post) => [post.id, post]));
  const cap = Math.max(1, Math.min(100, Math.trunc(perAccountLimit)));
  const acceptedByHandle = new Map<string, number>();
  const posts = response.data.map(parseXPost).sort((a, b) =>
    Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id),
  );
  const items: FeedItem[] = [];

  for (const post of posts) {
    const user = userById.get(post.author_id);
    if (!user) {
      throw new XFeedUpstreamError("X recent search response is missing a post author");
    }
    const account = accountByHandle.get(user.username.toLowerCase());
    if (!account) continue;
    const handleKey = user.username.toLowerCase();
    const accepted = acceptedByHandle.get(handleKey) ?? 0;
    if (accepted >= cap) continue;
    acceptedByHandle.set(handleKey, accepted + 1);

    const publishedAt = isoTimestamp(post.created_at);
    if (!publishedAt) {
      throw new XFeedUpstreamError("X recent search returned an invalid timestamp");
    }
    const title = post.note_tweet?.text ?? post.text;
    const statusUrl = `https://x.com/${user.username}/status/${post.id}`;
    const mediaList = (post.attachments?.media_keys ?? [])
      .map((key) => mediaByKey.get(key))
      .filter((item): item is XMedia => Boolean(item));
    const entries: Array<XMedia | null> = mediaList.length ? mediaList : [null];
    const quotedId = post.referenced_tweets?.find((reference) => reference.type === "quoted")?.id;
    const quotedPost = quotedId ? referencedPostById.get(quotedId) : undefined;
    const quotedAuthor = quotedPost ? userById.get(quotedPost.author_id) : undefined;
    const quotedImage = quotedPost?.attachments?.media_keys
      ?.map((key) => mediaByKey.get(key))
      .find((item): item is XMedia => Boolean(item))?.preview_image_url
      ?? quotedPost?.attachments?.media_keys
        ?.map((key) => mediaByKey.get(key))
        .find((item): item is XMedia => Boolean(item))?.url;
    const quote = quotedPost && quotedAuthor
      ? {
          statusId: quotedPost.id,
          statusUrl: `https://x.com/${quotedAuthor.username}/status/${quotedPost.id}`,
          text: quotedPost.note_tweet?.text ?? quotedPost.text,
          authorName: quotedAuthor.name,
          authorHandle: `@${quotedAuthor.username}`,
          authorProfileUrl: `https://x.com/${quotedAuthor.username}`,
          authorAvatarUrl: quotedAuthor.profile_image_url,
          imageUrl: quotedImage,
        }
      : undefined;

    for (const [index, item] of entries.entries()) {
      const orientation = mediaOrientation(item?.width, item?.height);
      const durationSeconds = item?.duration_ms
        ? Math.round(item.duration_ms / 1000)
        : undefined;
      const mediaUrl = item?.type === "photo"
        ? item.url
        : item
          ? xVideoUrl(item)
          : undefined;
      const thumbnailUrl = item?.preview_image_url ?? item?.url;
      const isPhoto = item?.type === "photo";
      const sourceUrl = item
        ? `${statusUrl}/${isPhoto ? "photo" : "video"}/${index + 1}`
        : statusUrl;
      items.push({
        id: item ? `x-${post.id}-${item.media_key}` : `x-${post.id}`,
        platform: "x",
        url: sourceUrl,
        sourceUrl,
        title,
        publishedAt,
        authorSlug: account.authorSlug,
        authorLabel: account.authorLabel,
        thumbnailUrl,
        mediaUrl,
        mediaType: item?.type === "photo" ? "image" : item?.type ?? "text",
        orientation,
        width: item?.width,
        height: item?.height,
        format: isPhoto
          ? "photo"
          : item
            ? orientation === "portrait" && (durationSeconds ?? Infinity) <= 180
              ? "short"
              : "long"
            : undefined,
        previewStrategy: mediaUrl && !isPhoto
          ? "video"
          : thumbnailUrl
            ? "image"
            : "external",
        embeddable: Boolean(mediaUrl && !isPhoto),
        focalPoint: CENTER,
        durationSeconds,
        duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
        liveCapability: "supported",
        x: {
          statusId: post.id,
          statusUrl,
          communityId: post.community_id,
          authorId: user.id,
          authorHandle: `@${user.username}`,
          authorName: user.name,
          authorProfileUrl: `https://x.com/${user.username}`,
          authorAvatarUrl: user.profile_image_url,
          authorDescription: user.description,
          authorUrl: user.url,
          verified: user.verified,
          verifiedType: user.verified_type,
          entities: post.entities,
          noteText: post.note_tweet?.text,
          noteEntities: post.note_tweet?.entities,
          quote,
        },
      });
    }
  }

  return items;
}

async function requestXRecentSearch(
  url: string,
  bearerToken: string,
  fetchImpl: XFeedFetch,
): Promise<XRecentSearchResponse> {
  let pendingForFetcher = inflightByFetcher.get(fetchImpl);
  if (!pendingForFetcher) {
    pendingForFetcher = new Map();
    inflightByFetcher.set(fetchImpl, pendingForFetcher);
  }
  const requestKey = `${url}\u0000${bearerToken}`;
  const existing = pendingForFetcher.get(requestKey);
  if (existing) return existing;

  const pending = (async () => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(X_RECENT_SEARCH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new XFeedUpstreamError("X recent search request failed", { cause: error });
    }
    if (!response.ok) {
      throw new XFeedUpstreamError(`X recent search returned HTTP ${response.status}`);
    }
    try {
      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        throw new XFeedUpstreamError("X recent search returned malformed JSON");
      }
      return payload as XRecentSearchResponse;
    } catch (error) {
      if (error instanceof XFeedUpstreamError) throw error;
      throw new XFeedUpstreamError("X recent search returned invalid JSON", { cause: error });
    }
  })();
  pendingForFetcher.set(requestKey, pending);
  try {
    return await pending;
  } finally {
    if (pendingForFetcher.get(requestKey) === pending) {
      pendingForFetcher.delete(requestKey);
    }
  }
}

/**
 * Execute exactly one official X recent-search request for all supplied
 * accounts. Concurrent identical calls share the same in-flight response.
 * Persistence and refresh scheduling deliberately live in x-feed-snapshot.
 */
export async function fetchXRecentSearchOnce(
  accounts: readonly XFeedAccount[],
  options: {
    bearerToken: string;
    perAccountLimit?: number;
    fetchImpl?: XFeedFetch;
  },
): Promise<FeedItem[]> {
  const bearerToken = options.bearerToken.trim();
  if (!bearerToken) {
    throw new XFeedUpstreamError("X_BEARER_TOKEN is not configured");
  }
  const normalized = normalizeXFeedAccounts(accounts);
  if (normalized.length === 0) {
    throw new XFeedUpstreamError("No valid X accounts are configured");
  }
  const perAccountLimit = Math.max(
    1,
    Math.min(100, Math.trunc(options.perAccountLimit ?? 12)),
  );
  const url = buildXRecentSearchUrl(normalized, perAccountLimit);
  if (!url) {
    throw new XFeedUpstreamError("No valid X accounts are configured");
  }
  const payload = await requestXRecentSearch(
    url,
    bearerToken,
    options.fetchImpl ?? fetch,
  );
  return parseXRecentSearchResponse(payload, normalized, perAccountLimit);
}

/**
 * Pull a bounded historical window through X's official full-archive endpoint.
 * This endpoint requires the account's pay-per-use or Enterprise entitlement.
 */
export async function fetchXFullArchiveSearch(
  accounts: readonly XFeedAccount[],
  options: {
    bearerToken: string;
    startTime: string;
    maxPages?: number;
    fetchImpl?: XFeedFetch;
  },
): Promise<FeedItem[]> {
  const bearerToken = options.bearerToken.trim();
  const normalized = normalizeXFeedAccounts(accounts);
  const firstUrl = buildXFullArchiveSearchUrl(normalized, options.startTime);
  if (!bearerToken) throw new XFeedUpstreamError("X_BEARER_TOKEN is not configured");
  if (!firstUrl) throw new XFeedUpstreamError("X full-archive search requires valid accounts and start time");

  const maxPages = Math.max(1, Math.min(20, Math.trunc(options.maxPages ?? 10)));
  const fetchImpl = options.fetchImpl ?? fetch;
  const merged = new Map<string, FeedItem>();
  let nextToken: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const url = page === 0 ? firstUrl : buildXFullArchiveSearchUrl(normalized, options.startTime, nextToken);
    if (!url) break;
    const payload = await requestXRecentSearch(url, bearerToken, fetchImpl);
    for (const item of parseXRecentSearchResponse(payload, normalized, 500)) {
      merged.set(item.id, item);
    }
    nextToken = typeof payload.meta?.next_token === "string" && payload.meta.next_token
      ? payload.meta.next_token
      : undefined;
    if (!nextToken) break;
    // X documents a one-request-per-second full-archive limit.
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
