/**
 * Pure, client-safe feed types. Kept out of `lib/social-feed.ts` (which
 * is `import "server-only"`) so client components — FeedCard, FeedSwitcher
 * — can reference the shape without pulling the server-only module into
 * the client bundle. `lib/social-feed.ts` re-exports these for servers.
 */

export type SocialPlatform = "youtube" | "x" | "instagram" | "tiktok";

export type MediaOrientation = "landscape" | "portrait" | "square";
export type FeedMediaType = "video" | "image" | "animated_gif" | "audio" | "text";
export type PreviewStrategy = "animated" | "embed" | "video" | "image" | "external";
export type ContentFormat = "long" | "short" | "live" | "photo";
export type LiveCapability = "supported" | "unsupported" | "not_configured";

export type FocalPoint = {
  /** Normalized 0..1 position, so the UI can use it as object-position. */
  x: number;
  y: number;
};

export type FeedChapter = {
  title: string;
  startSeconds: number;
  endSeconds?: number;
  kind?: "intro" | "chapter" | "credits";
};

export type XFeedEntity = {
  start?: number;
  end?: number;
  tag?: string;
  username?: string;
  url?: string;
  expanded_url?: string;
  display_url?: string;
  unwound_url?: string;
  probability?: number;
  type?: string;
  normalized_text?: string;
  /** Snapshot metadata supplied by X for an unwound URL. */
  title?: string;
  description?: string;
  images?: Array<{ url?: string; width?: number; height?: number }>;
  [key: string]: unknown;
};

export type XFeedEntities = {
  annotations?: XFeedEntity[];
  cashtags?: XFeedEntity[];
  hashtags?: XFeedEntity[];
  mentions?: XFeedEntity[];
  urls?: XFeedEntity[];
  [key: string]: unknown;
};

/**
 * A lightweight media preview carried with a quoted X post. These are image
 * URLs and dimensions from the scheduled server snapshot, never an X widget
 * or a browser-side X API request.
 */
export type XFeedQuoteMedia = {
  mediaKey: string;
  kind: "image" | "video";
  thumbnailUrl: string;
  width?: number;
  height?: number;
};

/**
 * Preserves a quote relationship even if its author made the source post
 * protected or deleted before the central refresh could expand it. It lets
 * clients show an honest unavailable state without retrying from each page.
 */
export type XFeedQuoteReference = {
  statusId: string;
  statusUrl: string;
  unavailable?: boolean;
};

export type XFeedMetadata = {
  statusId: string;
  statusUrl: string;
  /** Present only when X identifies this Post as belonging to a Community. */
  communityId?: string;
  authorId: string;
  authorHandle: string;
  authorName?: string;
  authorProfileUrl: string;
  authorAvatarUrl?: string;
  authorDescription?: string;
  authorUrl?: string;
  verified?: boolean;
  verifiedType?: string;
  entities?: XFeedEntities;
  noteText?: string;
  noteEntities?: XFeedEntities;
  /** A quoted status expanded or centrally hydrated by the scheduled roster refresh. */
  quote?: {
    statusId: string;
    statusUrl: string;
    text: string;
    authorName?: string;
    authorHandle: string;
    authorProfileUrl: string;
    authorAvatarUrl?: string;
    imageUrl?: string;
    /** Up to four source-media previews from the quoted status. */
    media?: XFeedQuoteMedia[];
    /** Snapshot entities make rich links inside the quote renderable offline. */
    entities?: XFeedEntities;
  };
  /**
   * Kept only until a scheduled quote lookup resolves the quote or confirms
   * it is unavailable. Render paths never use this to contact X.
   */
  quoteReference?: XFeedQuoteReference;
};

export type FeedItem = {
  id: string;
  /** Stable provider object id used for durable event de-duplication. */
  canonicalProviderId?: string;
  platform: SocialPlatform;
  url: string;
  title: string;
  /** ISO datetime — used to merge-sort across platforms. */
  publishedAt: string;
  authorSlug: string | null; // member slug, or null for the group account
  authorLabel: string;
  thumbnailUrl?: string;
  /** Direct playable media when the platform API exposes one. */
  mediaUrl?: string;
  /** Platform-supported embed URL, when one exists. */
  embedUrl?: string;
  /** Canonical platform permalink. `url` remains the backwards-compatible alias. */
  sourceUrl?: string;
  mediaType?: FeedMediaType;
  orientation?: MediaOrientation;
  width?: number;
  height?: number;
  format?: ContentFormat;
  previewStrategy?: PreviewStrategy;
  embeddable?: boolean;
  focalPoint?: FocalPoint;
  /** Whether this item is live now (currently Twitch/X Spaces only upstream). */
  isLive?: boolean;
  /** Actual provider start time for live media; distinct from post publish time. */
  liveStartedAt?: string;
  liveCapability?: LiveCapability;
  /** Optional duration string ("12:04") for video items. */
  duration?: string;
  /** Numeric duration for sorting/player logic without reparsing the label. */
  durationSeconds?: number;
  /** Chapter markers parsed from provider/editor metadata when available. */
  chapters?: FeedChapter[];
  relatedFullVideoId?: string;
  /** Official X response metadata retained for compliant post rendering. */
  x?: XFeedMetadata;
};
