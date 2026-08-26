import type {
  FocalPoint,
  LiveCapability,
  MediaOrientation,
  PreviewStrategy,
  XFeedMetadata,
} from "@/components/feed/types";

export type WatchKind = "live" | "youtube" | "vod" | "clip" | "post" | "tour";
export type WatchPlatform = "twitch" | "youtube" | "tiktok" | "instagram" | "x" | "house";

export type WatchChapter = {
  title: string;
  startSeconds: number;
  endSeconds?: number;
  kind?: "intro" | "chapter" | "credits";
};

export type WatchTextTrack = {
  src: string;
  label: string;
  language: string;
  kind?: "subtitles" | "captions" | "descriptions";
  default?: boolean;
};

export type WatchQualitySource = {
  id: string;
  label: string;
  src: string;
  width?: number;
  bitrate?: number;
};

export type WatchItem = {
  id: string;
  kind: WatchKind;
  platform: WatchPlatform;
  title: string;
  subtitle?: string;
  poster: string;
  backdrop: string;
  memberSlug: string | null;
  memberLabel: string;
  /** Specific linked channel/account attribution (for example "Marlon · VODs"). */
  accountLabel?: string;
  accent: string;
  href: string;
  /** Canonical platform permalink (distinct from the internal theater href). */
  sourceUrl?: string;
  /** Direct short-lived media URL, refreshed whenever the catalog is fetched. */
  mediaUrl?: string;
  embedUrl?: string;
  publishedAt?: string;
  live?: {
    viewers?: number;
    game?: string;
    startedAt?: string;
    login?: string;
    /** Twitch's immutable id for the exact live session. */
    streamId?: string;
    type?: "video" | "audio";
  };
  /** Twitch archive identity used to join a growing VOD to its live session. */
  twitch?: {
    streamId?: string;
    vodId?: string;
  };
  duration?: string;
  durationSeconds?: number;
  /** Real provider/editor chapter markers; never generated heuristically. */
  chapters?: WatchChapter[];
  /** Explicit full YouTube video linked by this Short's provider metadata. */
  relatedFullVideoId?: string;
  /** Native WebVTT tracks where the source exposes them. */
  captions?: WatchTextTrack[];
  /** Alternate native encodes. Embeds retain provider-owned quality controls. */
  qualities?: WatchQualitySource[];
  /** Alternate native media mix containing narrated visual description. */
  audioDescriptionUrl?: string;
  /** Explicit provider DVR capability. Native media is also feature-detected. */
  dvr?: {
    enabled: true;
    windowSeconds?: number;
    /** Growing archive used when a Twitch live viewer rewinds. */
    twitchVodId?: string;
  };
  format?: "long" | "short" | "live" | "photo";
  orientation?: MediaOrientation;
  width?: number;
  height?: number;
  previewStrategy?: PreviewStrategy;
  embeddable?: boolean;
  focalPoint?: FocalPoint;
  liveCapability?: LiveCapability;
  /** Cached official X metadata used to render a local, request-free post card. */
  x?: XFeedMetadata;
  /** Admin-authored routing for community sources. This never changes the provider identity. */
  programming?: {
    community: true;
    sourceId: string;
    curatedItemId?: string;
    routes: Array<{
      networkSlug: "core" | "adapt" | "ron" | "lacy" | "marlon" | "jason" | "silky";
      channelMode: "videos" | "shorts" | "continuous";
    }>;
  };
};

export type WatchShelf = {
  id: string;
  title: string;
  kicker?: string;
  items: WatchItem[];
};

export type WatchCatalog = {
  billboard: WatchItem | null;
  /** Every normalized item from every configured house/member source. */
  all: WatchItem[];
  live: WatchItem[];
  house: WatchItem[];
  byMember: Array<{ slug: string; label: string; accent: string; portrait: string; comm: string; items: WatchItem[] }>;
  /** Fast format shelves; all remain de-duplicated references from `all`. */
  videos: WatchItem[];
  shorts: WatchItem[];
  broadcasts: WatchItem[];
  clips: WatchItem[];
  photos: WatchItem[];
  recent: WatchItem[];
  byPlatform: Record<WatchPlatform, WatchItem[]>;
  liveCapabilities: Record<"twitch" | "x" | "tiktok" | "instagram", LiveCapability>;
  /** Explicit admin-curated hero entries, ordered by priority. */
  heroFeatured?: WatchItem[];
  /** Admin-created Watch homepage rails. */
  programmingSections?: Array<WatchShelf & { layout: "standard" | "vertical" | "auto" }>;
  fetchedAt: string;
};

export type PatreonLockedItem = {
  id: string;
  title: string;
  href: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  label: string;
  kind: "post" | "benefit";
  locked: true;
};

export type PatreonShelfData = {
  campaignName: string;
  campaignHref: string;
  items: PatreonLockedItem[];
  source: "public" | "fallback";
  generatedAt: string;
};
