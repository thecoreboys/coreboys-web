"use client";

import useSWR, { preload } from "swr";
import { fetchWatchGuide, guideRefreshInterval, WATCH_GUIDE_KEY, type GuidePayload } from "@/lib/watch/guide-response";

type GuideWindow = { start: number; end: number };

function watchGuideKey(window?: GuideWindow, linear?: boolean): string {
  return window ? `${WATCH_GUIDE_KEY}?start=${window.start}&end=${window.end}${linear === false ? "&linear=0" : ""}` : WATCH_GUIDE_KEY;
}

/** Warm the shared snapshot before a Guide opens, so it renders at once. */
export function preloadWatchGuide(window?: GuideWindow, linear?: boolean) {
  return preload(watchGuideKey(window, linear), fetchWatchGuide).catch(() => undefined);
}

/** One public snapshot shared by the full Guide, Tonight, and player guide. */
export function useWatchGuide(options?: { window?: GuideWindow; initialData?: GuidePayload; linear?: boolean }) {
  const key = watchGuideKey(options?.window, options?.linear);
  return useSWR(key, fetchWatchGuide, {
    fallbackData: options?.initialData,
    revalidateOnMount: options?.initialData?.partial ? true : undefined,
    keepPreviousData: true,
    // Revisiting a surface immediately renders the same cached snapshot.
    // Concurrent mounts and quick navigation share a single network request.
    dedupingInterval: 4_000,
    refreshInterval: guideRefreshInterval,
    revalidateOnFocus: true,
    focusThrottleInterval: 30_000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    errorRetryCount: 2,
    errorRetryInterval: 15_000,
  });
}
