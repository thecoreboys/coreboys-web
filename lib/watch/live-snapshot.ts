import type { WatchPlatform } from "./types";

/** Public, provider-neutral live state used by Watch chrome and live counters. */
export type UnifiedLiveEntry = {
  id: string;
  platform: WatchPlatform;
  memberSlug: string | null;
  dvrVodId: string | null;
  login: string | null;
  youtubeId: string | null;
  title: string | null;
  poster: string | null;
  sourceUrl: string | null;
  startedAt: string | null;
  viewerCount: number | null;
};

export type UnifiedLiveSnapshot = {
  live: UnifiedLiveEntry[];
  fetchedAt: string;
};
