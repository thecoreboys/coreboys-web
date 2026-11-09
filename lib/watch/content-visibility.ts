import type { WatchCatalog, WatchItem } from "./types";

/** Project every shelf, including cached hero entries, through the same decision. */
export function filterWatchCatalog(catalog: WatchCatalog, allowed: (item: WatchItem) => boolean,
  project: (item: WatchItem) => WatchItem = (item) => item): WatchCatalog {
  const filter = (items: readonly WatchItem[]) => items.filter(allowed).map(project);
  return {
    ...catalog,
    billboard: catalog.billboard && allowed(catalog.billboard) ? project(catalog.billboard) : null,
    all: filter(catalog.all), live: filter(catalog.live), house: filter(catalog.house),
    videos: filter(catalog.videos), shorts: filter(catalog.shorts), broadcasts: filter(catalog.broadcasts),
    clips: filter(catalog.clips), photos: filter(catalog.photos), recent: filter(catalog.recent),
    heroFeatured: catalog.heroFeatured ? filter(catalog.heroFeatured) : undefined,
    byMember: catalog.byMember.map((member) => ({ ...member, items: filter(member.items) })),
    byPlatform: Object.fromEntries(Object.entries(catalog.byPlatform)
      .map(([platform, items]) => [platform, filter(items)])) as WatchCatalog["byPlatform"],
    programmingSections: catalog.programmingSections?.map((section) => ({ ...section, items: filter(section.items) })),
  };
}

/** Include aliases/hero-only rows when checking a previously cached catalog. */
export function catalogVisibilityItems(catalog: WatchCatalog): WatchItem[] {
  return [...catalog.all, ...catalog.live, ...catalog.house, ...catalog.videos,
    ...catalog.shorts, ...catalog.broadcasts, ...catalog.clips, ...catalog.photos, ...catalog.recent,
    ...Object.values(catalog.byPlatform).flat(), ...catalog.byMember.flatMap((member) => member.items),
    ...(catalog.heroFeatured ?? []), ...(catalog.billboard ? [catalog.billboard] : []),
    ...(catalog.programmingSections ?? []).flatMap((section) => section.items)];
}
