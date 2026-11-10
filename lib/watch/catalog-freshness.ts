import { filterWatchCatalog } from "./content-visibility";
import type { WatchCatalog, WatchItem } from "./types";

const identity = (item: WatchItem) => `${item.platform}:${item.id}`;

/** Reuse historical metadata while current feeds own live status and recent updates. */
export function mergeFreshWatchCatalog(archive: WatchCatalog, recent: WatchCatalog): WatchCatalog {
  const updates = new Map(recent.all.map((item) => [identity(item), item]));
  for (const item of recent.live) updates.set(identity(item), item);
  const history = filterWatchCatalog(archive,
    (item) => item.kind !== "live" && updates.get(identity(item))?.kind !== "live",
    (item) => updates.get(identity(item)) ?? item);
  const merge = (older: readonly WatchItem[], newer: readonly WatchItem[]) => {
    const seen = new Set<string>();
    const currentMembers = new Set(newer.map(identity));
    // A newly reclassified Short/live upload belongs only in its current
    // shelves, even when an older generation placed it in ordinary videos.
    return [...newer, ...older.filter((item) => !updates.has(identity(item)) || currentMembers.has(identity(item)))].filter((item) => {
      const key = identity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const currentBillboard = archive.billboard?.kind === "live"
    ? recent.live.find((item) => identity(item) === identity(archive.billboard!)) ?? recent.billboard
    : history.billboard;
  return {
    ...history,
    billboard: currentBillboard,
    all: merge(history.all, recent.all), live: recent.live,
    house: merge(history.house, recent.house), videos: merge(history.videos, recent.videos),
    shorts: merge(history.shorts, recent.shorts), broadcasts: merge(history.broadcasts, recent.broadcasts),
    clips: merge(history.clips, recent.clips), photos: merge(history.photos, recent.photos), recent: recent.recent,
    byPlatform: Object.fromEntries(Object.entries(history.byPlatform).map(([platform, items]) => [
      platform, merge(items, recent.byPlatform[platform as WatchItem["platform"]]),
    ])) as WatchCatalog["byPlatform"],
    byMember: history.byMember.map((member) => ({ ...member,
      items: merge(member.items, recent.byMember.find((entry) => entry.slug === member.slug)?.items ?? []),
    })),
    // Use the current observation date for the shared daily Shorts shuffle.
    fetchedAt: recent.fetchedAt, liveCapabilities: recent.liveCapabilities,
  };
}
