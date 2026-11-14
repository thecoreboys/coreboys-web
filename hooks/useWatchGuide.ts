"use client";

import useSWR from "swr";
import { fetchWatchGuide, WATCH_GUIDE_KEY } from "@/lib/watch/guide-response";

/** One public snapshot shared by the full Guide, Tonight, and player guide. */
export function useWatchGuide() {
  return useSWR(WATCH_GUIDE_KEY, fetchWatchGuide, {
    // Revisiting a surface immediately renders the same cached snapshot.
    // Concurrent mounts and quick navigation share a single network request.
    dedupingInterval: 30_000,
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    focusThrottleInterval: 30_000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    errorRetryCount: 2,
    errorRetryInterval: 15_000,
  });
}
