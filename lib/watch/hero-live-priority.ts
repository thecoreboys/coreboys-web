import type { WatchItem } from "./types";

/** Distinguish a newly started broadcast from metadata changes on the same source. */
export function heroLiveIdentity(item: WatchItem): string | null {
  if (item.kind !== "live") return null;
  return `${item.platform}:${item.id}:${item.live?.streamId ?? item.live?.startedAt ?? ""}`;
}

export function newlyLiveHero(previous: ReadonlySet<string>, slides: readonly WatchItem[]): string | null {
  for (const item of slides) {
    const key = heroLiveIdentity(item);
    if (key && !previous.has(key)) return key;
  }
  return null;
}
