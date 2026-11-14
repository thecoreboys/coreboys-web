import type { WatchItem } from "./types";

/** Current availability is authoritative; the format marker may be stale on an archived broadcast. */
export function isLiveWatchItem(item: Pick<WatchItem, "kind" | "format">): boolean {
  return item.kind === "live";
}
