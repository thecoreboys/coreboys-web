import type { WatchItem } from "./types";

/** Treat either live marker as authoritative so stale catalog records cannot look like VODs. */
export function isLiveWatchItem(item: Pick<WatchItem, "kind" | "format">): boolean {
  return item.kind === "live" || item.format === "live";
}
