import type { WatchCatalog, WatchItem } from "./types";

export const FREE_MULTIVIEW_TILE_LIMIT = 2;
export const EXPANDED_MULTIVIEW_TILE_LIMIT = 12;

export type LockedLiveRoomSlot = {
  id: string;
  ordinal: number;
  locked: true;
};

export type MultiviewLiveRoom = {
  mode: "all-current-live";
  playableItems: WatchItem[];
  lockedSlots: LockedLiveRoomSlot[];
  totalLive: number;
  tileLimit: number;
};

export function multiviewTileLimit(expanded: boolean): number {
  return expanded ? EXPANDED_MULTIVIEW_TILE_LIMIT : FREE_MULTIVIEW_TILE_LIMIT;
}

export function effectiveMultiviewFillLimit(
  entitlementLimit: number,
  requestedLimit?: number,
): number {
  const entitled = Number.isFinite(entitlementLimit)
    ? Math.min(EXPANDED_MULTIVIEW_TILE_LIMIT, Math.max(1, Math.floor(entitlementLimit)))
    : FREE_MULTIVIEW_TILE_LIMIT;
  if (requestedLimit === undefined || !Number.isFinite(requestedLimit)) return entitled;
  return Math.min(entitled, Math.max(1, Math.floor(requestedLimit)));
}

export function clampMultiviewItems<T>(items: readonly T[], entitlementLimit: number): T[] {
  return items.slice(0, effectiveMultiviewFillLimit(entitlementLimit));
}

/**
 * Builds the server-authoritative initial room. Locked positions deliberately
 * contain no title, login, URL, provider id, poster, or embed configuration.
 */
export function buildMultiviewLiveRoom(
  liveItems: readonly WatchItem[],
  expanded: boolean,
): MultiviewLiveRoom {
  const current = liveItems.filter((item) => item.kind === "live");
  const tileLimit = multiviewTileLimit(expanded);
  const playableItems = current.slice(0, tileLimit);
  return {
    mode: "all-current-live",
    playableItems,
    lockedSlots: current.slice(tileLimit).map((_, index) => ({
      id: `locked-live-${tileLimit + index + 1}`,
      ordinal: tileLimit + index + 1,
      locked: true,
    })),
    totalLive: current.length,
    tileLimit,
  };
}

function allowedCatalogItem(item: WatchItem, playableLiveIds: ReadonlySet<string>) {
  return item.kind !== "live" || playableLiveIds.has(item.id);
}

/**
 * Removes locked live transports from the RSC payload. The locked grid tiles
 * are not a blurred iframe: the browser never receives their playable item.
 */
export function restrictCatalogForLiveRoom(
  catalog: WatchCatalog,
  room: MultiviewLiveRoom,
): WatchCatalog {
  const playableLiveIds = new Set(room.playableItems.map((item) => item.id));
  const filter = (items: WatchItem[]) => items.filter((item) => allowedCatalogItem(item, playableLiveIds));
  const byPlatform = Object.fromEntries(
    Object.entries(catalog.byPlatform).map(([platform, items]) => [platform, filter(items)]),
  ) as WatchCatalog["byPlatform"];

  return {
    ...catalog,
    billboard: catalog.billboard && allowedCatalogItem(catalog.billboard, playableLiveIds)
      ? catalog.billboard
      : null,
    all: filter(catalog.all),
    live: filter(catalog.live),
    house: filter(catalog.house),
    videos: filter(catalog.videos),
    shorts: filter(catalog.shorts),
    broadcasts: filter(catalog.broadcasts),
    clips: filter(catalog.clips),
    photos: filter(catalog.photos),
    recent: filter(catalog.recent),
    byMember: catalog.byMember.map((member) => ({
      ...member,
      items: filter(member.items),
    })),
    byPlatform,
    heroFeatured: catalog.heroFeatured?.filter((item) => allowedCatalogItem(item, playableLiveIds)),
    programmingSections: catalog.programmingSections?.map((section) => ({
      ...section,
      items: filter(section.items),
    })),
  };
}
