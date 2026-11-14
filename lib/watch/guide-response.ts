import type { GuideNetworkGroup, NetworkChannelMode } from "./channels";
import type { WatchItem, WatchPlatform } from "./types";
import { unpackGuidePayload, type CompactGuidePayload } from "./guide-transport";

export type GuideStatus = "live" | "upcoming" | "replay" | "published";
export type GuideContentType = "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";
export type GuideSourceState = "ok" | "empty" | "unconfigured" | "loading" | "error";

export type GuideProgram = {
  id: string;
  slug: string;
  login: string | null;
  title: string;
  game: string | null;
  startsAt: string;
  endsAt: string | null;
  status: GuideStatus;
  platform: WatchPlatform;
  thumbnailUrl: string | null;
  vodId: string | null;
  youtubeId: string | null;
  sourceUrl: string;
  contentType?: GuideContentType;
  orientation?: WatchItem["orientation"];
  durationSeconds?: number | null;
  watchItem?: WatchItem;
  guideRowId?: string;
  channelMode?: NetworkChannelMode;
  continuous?: boolean;
  continuousPhase?: "past" | "now" | "future";
};

export type GuidePayload = {
  partial?: boolean;
  window?: { start: number; end: number; earliest: number };
  serverNow: string;
  horizonEnd: string;
  programs: GuideProgram[];
  networks?: GuideNetworkGroup[];
  sources?: {
    catalog?: GuideSourceState;
    twitchSchedule?: GuideSourceState;
    youtubeUpcoming?: GuideSourceState;
    socialTimeline?: GuideSourceState;
    recordedSessions?: GuideSourceState;
  };
};

export const WATCH_GUIDE_KEY = "/api/watch/guide";

/** Pick up a cold background load promptly, then return to normal polling. */
export function guideRefreshInterval(data?: GuidePayload): number {
  return (data?.partial && data.sources?.catalog !== "error") || Object.values(data?.sources ?? {}).includes("loading") ? 5_000 : 60_000;
}

export async function fetchWatchGuide(url: string): Promise<GuidePayload> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "X-CORE-Guide-Format": "compact-v1" },
    // Release SWR's in-flight request if an origin never responds, allowing
    // the next attempt to recover while the last successful guide stays up.
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Guide unavailable (${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !Array.isArray((data as GuidePayload).programs)) {
    throw new Error("Guide unavailable (invalid response)");
  }
  if ((data as CompactGuidePayload).format === "compact-v1") {
    try {
      return unpackGuidePayload(data as CompactGuidePayload);
    } catch {
      throw new Error("Guide unavailable (invalid response)");
    }
  }
  return data as GuidePayload;
}
