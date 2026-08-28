import type {
  FeedItem,
  XFeedEntities,
  XFeedMetadata,
  XFeedQuoteMedia,
  XFeedQuoteReference,
} from "@/components/feed/types";

export const X_RECENT_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/recent";
export const X_FULL_ARCHIVE_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/all";
export const X_POST_LOOKUP_ENDPOINT = "https://api.x.com/2/tweets";
export const X_RECENT_SEARCH_TIMEOUT_MS = 10_000;
/** One optional scheduled backfill request never needs more than this many IDs. */
export const X_QUOTE_LOOKUP_MAX_IDS = 20;

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
  errors?: Array<{
    resource_id?: string;
    title?: string;
    type?: string;
  }>;
};

export type XFeedQuote = NonNullable<XFeedMetadata["quote"]>;

export type XQuoteLookupResult = {
  quotes: ReadonlyMap<string, XFeedQuote>;
  /** IDs which X explicitly reported deleted, protected, or otherwise unavailable. */
  unavailableIds: ReadonlySet<string>;
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

function normalizeXStatusId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const statusId = value.trim();
  return /^[1-9]\d{4,24}$/.test(statusId) ? statusId : null;
}

function xStatusIdFromUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) {
      return null;
    }
    return normalizeXStatusId(url.pathname.match(/\/status\/(\d{5,25})/i)?.[1]);
  } catch {
    return null;
  }
}

/**
 * Derive a recent-search cursor only from a canonical status already stored in
 * the durable snapshot. Requiring the numeric metadata ID to agree with an X
 * permalink keeps a malformed cached row from advancing the cursor.
 */
export function newestXSnapshotStatusId(items: readonly FeedItem[]): string | undefined {
  let newest: { statusId: string; publishedAt: number } | undefined;
  for (const item of items) {
    if (item.platform !== "x") continue;
    const metadataId = normalizeXStatusId(item.x?.statusId);
    if (!metadataId) continue;
    const permalinkIds = [item.x?.statusUrl, item.sourceUrl, item.url]
      .map(xStatusIdFromUrl)
      .filter((statusId): statusId is string => Boolean(statusId));
    if (!permalinkIds.includes(metadataId)) continue;
    const publishedAt = Date.parse(item.publishedAt);
    if (!Number.isFinite(publishedAt)) continue;
    if (
      !newest ||
      publishedAt > newest.publishedAt ||
      (publishedAt === newest.publishedAt && BigInt(metadataId) > BigInt(newest.statusId))
    ) {
      newest = { statusId: metadataId, publishedAt };
    }
  }
  return newest?.statusId;
}

export function buildXRecentSearchUrl(
  accounts: readonly XFeedAccount[],
  sinceId?: string,
): string | null {
  const normalized = normalizeXFeedAccounts(accounts);
  if (normalized.length === 0) return null;
  const query = `(${normalized.map((account) => `from:${account.handle}`).join(" OR ")}) -is:reply -is:retweet`;
  const params = new URLSearchParams({
    query,
    // Use X's complete one-request recent-search window. Applying a separate
    // per-account clip after this combined query could silently discard a busy
    // creator's posts even though they were already returned and billed.
    max_results: "100",
    "tweet.fields": "attachments,author_id,community_id,created_at,entities,note_tweet,referenced_tweets",
    expansions: "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
    "media.fields": "duration_ms,height,media_key,preview_image_url,type,url,variants,width",
    "user.fields": "description,id,name,profile_image_url,url,username,verified,verified_type",
  });
  const cursor = normalizeXStatusId(sinceId);
  if (cursor) params.set("since_id", cursor);
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
    expansions: "attachments.media_keys,author_id,referenced_tweets.id,referenced_tweets.id.author_id,referenced_tweets.id.attachments.media_keys",
    "media.fields": "duration_ms,height,media_key,preview_image_url,type,url,variants,width",
    "user.fields": "description,id,name,profile_image_url,url,username,verified,verified_type",
  });
  if (nextToken) params.set("next_token", nextToken);
  return `${X_FULL_ARCHIVE_SEARCH_ENDPOINT}?${params}`;
}

/**
 * Build a single official lookup request for quote IDs discovered in an older
 * durable snapshot. This is intentionally bounded and is only called from the
 * authenticated refresh route — never while a visitor renders a page.
 */
export function buildXQuoteLookupUrl(statusIds: readonly string[]): string | null {
  const ids = [...new Set(statusIds.filter((id) => /^\d{5,25}$/.test(id)))].slice(
    0,
    X_QUOTE_LOOKUP_MAX_IDS,
  );
  if (!ids.length) return null;
  const params = new URLSearchParams({
    ids: ids.join(","),
    "tweet.fields": "attachments,author_id,created_at,entities,note_tweet",
    expansions: "attachments.media_keys,author_id",
    "media.fields": "height,media_key,preview_image_url,type,url,width",
    "user.fields": "id,name,profile_image_url,username",
  });
  return `${X_POST_LOOKUP_ENDPOINT}?${params}`;
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

function quoteMediaFromPost(
  post: XPost,
  mediaByKey: ReadonlyMap<string, XMedia>,
): XFeedQuoteMedia[] {
  return (post.attachments?.media_keys ?? [])
    .map((key) => mediaByKey.get(key))
    .filter((item): item is XMedia => Boolean(item))
    .flatMap((item) => {
      const thumbnailUrl = item.preview_image_url ?? item.url;
      if (!thumbnailUrl) return [];
      return [{
        mediaKey: item.media_key,
        kind: item.type === "photo" ? "image" as const : "video" as const,
        thumbnailUrl,
        width: item.width,
        height: item.height,
      }];
    })
    .slice(0, 4);
}

function quoteFromPost(
  post: XPost,
  author: XUser | undefined,
  mediaByKey: ReadonlyMap<string, XMedia>,
): XFeedQuote | undefined {
  if (!author) return undefined;
  const media = quoteMediaFromPost(post, mediaByKey);
  const text = post.note_tweet?.text ?? post.text;
  const entities = post.note_tweet?.entities ?? post.entities;
  return {
    statusId: post.id,
    statusUrl: `https://x.com/${author.username}/status/${post.id}`,
    text,
    authorName: author.name,
    authorHandle: `@${author.username}`,
    authorProfileUrl: `https://x.com/${author.username}`,
    authorAvatarUrl: author.profile_image_url,
    imageUrl: media[0]?.thumbnailUrl,
    ...(media.length ? { media } : {}),
    ...(entities ? { entities } : {}),
  };
}

function statusUrlFromEntities(
  entities: XFeedEntities | undefined,
  statusId: string,
): string | undefined {
  for (const entity of entities?.urls ?? []) {
    for (const raw of [entity.unwound_url, entity.expanded_url, entity.url]) {
      if (typeof raw !== "string") continue;
      try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const match = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(url.pathname);
        if ((host === "x.com" || host === "twitter.com") && match?.[2] === statusId) {
          return `https://x.com/${match[1]}/status/${statusId}`;
        }
      } catch {
        // An invalid entity URL must not break the scheduled snapshot.
      }
    }
  }
  return undefined;
}

function quoteReferenceFromPost(post: XPost, quotedId: string): XFeedQuoteReference {
  const statusUrl =
    statusUrlFromEntities(post.note_tweet?.entities, quotedId) ??
    statusUrlFromEntities(post.entities, quotedId) ??
    `https://x.com/i/status/${quotedId}`;
  return { statusId: quotedId, statusUrl };
}

export function parseXRecentSearchResponse(
  payload: unknown,
  accounts: readonly XFeedAccount[],
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
    const quote = quotedPost ? quoteFromPost(quotedPost, quotedAuthor, mediaByKey) : undefined;
    const quoteReference = quotedId && !quote
      ? quoteReferenceFromPost(post, quotedId)
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
          quoteReference,
        },
      });
    }
  }

  return items;
}

async function requestXRead(
  url: string,
  bearerToken: string,
  fetchImpl: XFeedFetch,
  label: "recent search" | "quote lookup" | "full archive search" = "recent search",
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
      throw new XFeedUpstreamError(`X ${label} request failed`, { cause: error });
    }
    if (!response.ok) {
      throw new XFeedUpstreamError(`X ${label} returned HTTP ${response.status}`);
    }
    try {
      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        throw new XFeedUpstreamError(`X ${label} returned malformed JSON`);
      }
      return payload as XRecentSearchResponse;
    } catch (error) {
      if (error instanceof XFeedUpstreamError) throw error;
      throw new XFeedUpstreamError(`X ${label} returned invalid JSON`, { cause: error });
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

function parseXQuoteLookupResponse(
  payload: unknown,
  statusIds: readonly string[],
): XQuoteLookupResult {
  if (!isRecord(payload)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed JSON");
  }
  const requested = new Set(statusIds.filter((id) => /^\d{5,25}$/.test(id)));
  const response = payload as XRecentSearchResponse;
  if (response.data !== undefined && !Array.isArray(response.data)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed data");
  }
  if (response.includes !== undefined && !isRecord(response.includes)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed includes");
  }
  if (response.includes?.users !== undefined && !Array.isArray(response.includes.users)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed users");
  }
  if (response.includes?.media !== undefined && !Array.isArray(response.includes.media)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed media");
  }
  if (response.errors !== undefined && !Array.isArray(response.errors)) {
    throw new XFeedUpstreamError("X quote lookup returned malformed errors");
  }

  const posts = (response.data ?? []).map(parseXPost);
  const returnedIds = new Set(posts.map((post) => post.id));
  const users = (response.includes?.users ?? []).map(parseXUser);
  const media = (response.includes?.media ?? []).map(parseXMedia);
  const userById = new Map(users.map((user) => [user.id, user]));
  const mediaByKey = new Map(media.map((item) => [item.media_key, item]));
  const quotes = new Map<string, XFeedQuote>();
  for (const post of posts) {
    if (!requested.has(post.id)) continue;
    const quote = quoteFromPost(post, userById.get(post.author_id), mediaByKey);
    if (quote) quotes.set(post.id, quote);
  }

  const unavailableIds = new Set<string>();
  for (const error of response.errors ?? []) {
    if (!isRecord(error) || typeof error.resource_id !== "string") continue;
    if (requested.has(error.resource_id)) unavailableIds.add(error.resource_id);
  }
  // A lookup may omit a deleted or protected Post without an item-level error.
  // Treat only truly absent IDs as unavailable; a returned post missing a user
  // expansion remains eligible for a later scheduled retry instead of being
  // falsely represented as deleted.
  for (const statusId of requested) {
    if (!returnedIds.has(statusId) && !quotes.has(statusId)) {
      unavailableIds.add(statusId);
    }
  }
  return { quotes, unavailableIds };
}

function statusReferenceFromUrl(value: unknown): XFeedQuoteReference | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "x.com" && host !== "twitter.com")) return undefined;
    const canonical = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})/i.exec(url.pathname);
    if (canonical?.[1] && canonical[2]) {
      return {
        statusId: canonical[2],
        statusUrl: `https://x.com/${canonical[1]}/status/${canonical[2]}`,
      };
    }
    const internal = /^\/i\/status\/(\d{5,25})/i.exec(url.pathname);
    return internal?.[1]
      ? { statusId: internal[1], statusUrl: `https://x.com/i/status/${internal[1]}` }
      : undefined;
  } catch {
    return undefined;
  }
}

function pendingQuoteReference(item: FeedItem): XFeedQuoteReference | undefined {
  const metadata = item.x;
  if (!metadata || metadata.quote || metadata.quoteReference?.unavailable) return undefined;
  const stored = metadata.quoteReference;
  if (stored && /^\d{5,25}$/.test(stored.statusId) && statusReferenceFromUrl(stored.statusUrl)) {
    return stored;
  }
  const ownStatusId = metadata.statusId;
  const entities = [metadata.noteEntities, metadata.entities];
  for (const group of entities) {
    for (const entity of group?.urls ?? []) {
      const reference = statusReferenceFromUrl(
        entity.unwound_url ?? entity.expanded_url ?? entity.url,
      );
      if (reference && reference.statusId !== ownStatusId) return reference;
    }
  }
  return undefined;
}

/**
 * Find a small, de-duplicated batch of unresolved quoted statuses from a
 * durable roster snapshot. This has no network effect by itself.
 */
export function collectPendingXQuoteReferences(
  items: readonly FeedItem[],
  limit = X_QUOTE_LOOKUP_MAX_IDS,
): XFeedQuoteReference[] {
  const cap = Math.max(0, Math.min(X_QUOTE_LOOKUP_MAX_IDS, Math.trunc(limit)));
  // A fresh media row for the same status may already carry the expansion
  // while a legacy duplicate in the old snapshot does not. Never spend a
  // lookup on that duplicate; the snapshot merge will prefer the fresh row.
  const resolvedParentStatuses = new Set(
    items.flatMap((item) => item.x?.quote ? [item.x.statusId] : []),
  );
  const seen = new Set<string>();
  const references: XFeedQuoteReference[] = [];
  for (const item of items) {
    if (item.x && resolvedParentStatuses.has(item.x.statusId)) continue;
    const reference = pendingQuoteReference(item);
    if (!reference || seen.has(reference.statusId)) continue;
    seen.add(reference.statusId);
    references.push(reference);
    if (references.length === cap) break;
  }
  return references;
}

/** Apply centrally fetched quote data to every media row from the same post. */
export function applyXQuoteLookup(
  items: readonly FeedItem[],
  result: XQuoteLookupResult,
): FeedItem[] {
  return items.map((item) => {
    const reference = pendingQuoteReference(item);
    if (!reference || !item.x) return item;
    const quote = result.quotes.get(reference.statusId);
    if (quote) {
      return {
        ...item,
        x: { ...item.x, quote, quoteReference: undefined },
      };
    }
    if (result.unavailableIds.has(reference.statusId)) {
      return {
        ...item,
        x: {
          ...item.x,
          quoteReference: { ...reference, unavailable: true },
        },
      };
    }
    return item;
  });
}

/**
 * The only transport for legacy quote hydration. Call this from the protected
 * scheduled refresh after reserving its separate, bounded X API budget.
 */
export async function fetchXQuoteLookupOnce(
  references: readonly XFeedQuoteReference[],
  options: { bearerToken: string; fetchImpl?: XFeedFetch },
): Promise<XQuoteLookupResult> {
  const bearerToken = options.bearerToken.trim();
  if (!bearerToken) throw new XFeedUpstreamError("X_BEARER_TOKEN is not configured");
  const statusIds = references.map((reference) => reference.statusId);
  const url = buildXQuoteLookupUrl(statusIds);
  if (!url) return { quotes: new Map(), unavailableIds: new Set() };
  const payload = await requestXRead(url, bearerToken, options.fetchImpl ?? fetch, "quote lookup");
  return parseXQuoteLookupResponse(payload, statusIds);
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
    sinceId?: string;
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
  const url = buildXRecentSearchUrl(normalized, options.sinceId);
  if (!url) {
    throw new XFeedUpstreamError("No valid X accounts are configured");
  }
  const payload = await requestXRead(
    url,
    bearerToken,
    options.fetchImpl ?? fetch,
  );
  return parseXRecentSearchResponse(payload, normalized);
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
    const payload = await requestXRead(url, bearerToken, fetchImpl, "full archive search");
    for (const item of parseXRecentSearchResponse(payload, normalized)) {
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
