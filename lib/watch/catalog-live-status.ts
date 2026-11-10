import { filterWatchCatalog } from "./content-visibility";
import type { WatchCatalog, WatchItem } from "./types";

/** Only the current provider snapshot can keep a cached item marked live. */
export function reconcileCatalogLive(catalog: WatchCatalog, currentLive: readonly WatchItem[] = catalog.live): WatchCatalog {
  const current = new Set(currentLive.map((item) => `${item.platform}:${item.id}`));
  const confirmed = (item: WatchItem) => current.has(`${item.platform}:${item.id}`);
  const projected = new Map<WatchItem, WatchItem>();
  const project = (item: WatchItem): WatchItem => {
    if (projected.has(item)) return projected.get(item)!;
    const next = !confirmed(item) && (item.kind === "live" || item.format === "live") ? {
      ...item,
      kind: item.kind === "live" ? "vod" as const : item.kind,
      format: item.format === "live" ? "long" as const : item.format,
      href: item.platform === "youtube"
        ? item.href.replace(/([?&]kind=)live(?=&|$)/, "$1youtube").replace(/([?&]format=)live(?=&|$)/, "$1long")
        : item.href,
    } : item;
    projected.set(item, next);
    return next;
  };
  // A stale Twitch channel is not a playable archive without a real VOD id.
  const allowed = (item: WatchItem) => confirmed(item) || item.kind !== "live" || item.platform === "youtube";
  const result = filterWatchCatalog(catalog, allowed, project);
  result.live = catalog.live.filter((item) => item.kind === "live" && confirmed(item));
  return result;
}
