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
  /** A quoted status included in the same scheduled X roster response. */
  quote?: {
    statusId: string;
    statusUrl: string;
    text: string;
    authorName?: string;
    authorHandle: string;
    authorProfileUrl: string;
    authorAvatarUrl?: string;
    imageUrl?: string;
  };
};

export type FeedItem = {
  id: string;
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
