import type { WatchCatalog, WatchItem } from "./types";

/** Archived records are not evidence that a provider is still broadcasting. */
export function guideLiveCatalog(catalog: WatchCatalog): WatchCatalog {
  const current = new Set(catalog.live.map((item) => `${item.platform}:${item.id}`));
  const all = catalog.all.map((item): WatchItem => {
    if ((item.kind !== "live" && item.format !== "live") || current.has(`${item.platform}:${item.id}`)) return item;
    return {
      ...item,
      kind: item.kind === "live" ? "vod" : item.kind,
      format: item.format === "live" ? "long" : item.format,
      href: item.platform === "youtube"
        ? item.href.replace(/([?&]kind=)live(?=&|$)/, "$1youtube").replace(/([?&]format=)live(?=&|$)/, "$1long")
        : item.href,
    };
  });
  return { ...catalog, all };
}
