import type { GuideNetworkGroup, NetworkChannelMode } from "./channels";
import type { WatchItem, WatchPlatform } from "./types";

export type GuideStatus = "live" | "upcoming" | "replay" | "published";
export type GuideContentType = "live" | "broadcast" | "video" | "short" | "clip" | "photo" | "post";

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
  serverNow: string;
  horizonEnd: string;
  programs: GuideProgram[];
  networks?: GuideNetworkGroup[];
  sources?: {
    twitchSchedule?: "ok" | "empty" | "unconfigured" | "error";
    youtubeUpcoming?: "ok" | "empty" | "unconfigured" | "error";
    socialTimeline?: "ok" | "empty" | "unconfigured" | "error";
  };
};

export const WATCH_GUIDE_KEY = "/api/watch/guide";

export async function fetchWatchGuide(url: string): Promise<GuidePayload> {
  const response = await fetch(url, {
    credentials: "same-origin",
    // Release SWR's in-flight request if an origin never responds, allowing
    // the next attempt to recover while the last successful guide stays up.
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Guide unavailable (${response.status})`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !Array.isArray((data as GuidePayload).programs)) {
    throw new Error("Guide unavailable (invalid response)");
  }
  return data as GuidePayload;
}
