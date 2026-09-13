import { homeItemReferences } from "./home-catalog";
import type { MultiviewLiveRoom } from "./multiview-access";
import { decodeWorkspace } from "./workspace";
import type { WatchCatalog, WatchItem } from "./types";

export const MULTIVIEW_CATALOG_ITEM_LIMIT = 240;
const key = (item: WatchItem) => `${item.platform}:${item.id}`;

/** True only for content that can occupy a functioning Multiview player tile. */
export function isMultiviewSource(item: Pick<WatchItem, "kind" | "platform" | "embeddable" | "mediaUrl" | "embedUrl">): boolean {
  return item.kind !== "post"
    && item.platform !== "x"
    && !(item.embeddable === false && !item.mediaUrl && !item.embedUrl);
}

export function multiviewRequestedReferences(params: { add?: string; layout?: string }): string[] {
  const refs = new Set<string>();
  if (params.add && params.add.length <= 200) refs.add(params.add);
  if (params.layout) {
    for (const tile of decodeWorkspace(params.layout)?.tiles ?? []) refs.add(tile.item.key);
  }
  return [...refs];
}

/** The picker initially displays 80 suggestions; archive search stays server-side. */
export function projectMultiviewCatalog(catalog: WatchCatalog, references: readonly string[] = []): WatchCatalog {
  const wanted = new Set(references);
  const selected = new Set(catalog.live.filter(isMultiviewSource).map(key));
  const groups = new Map<string, WatchItem[]>();
  for (const item of catalog.all) {
    if (!isMultiviewSource(item)) continue;
    if (wanted.size && homeItemReferences(item).some((ref) => wanted.has(ref))) selected.add(key(item));
    const group = `${item.memberSlug ?? "house"}:${item.platform}:${item.accountLabel ?? ""}:${item.format ?? item.kind}`;
    const items = groups.get(group) ?? [];
    items.push(item);
    groups.set(group, items);
  }
  for (let depth = 0; selected.size < MULTIVIEW_CATALOG_ITEM_LIMIT; depth++) {
    let found = false;
    for (const items of groups.values()) {
      const item = items[depth];
      if (!item) continue;
      found = true;
      selected.add(key(item));
      if (selected.size >= MULTIVIEW_CATALOG_ITEM_LIMIT) break;
    }
    if (!found) break;
  }
  const filter = (items: WatchItem[]) => items.filter((item) => isMultiviewSource(item) && selected.has(key(item)));
  return {
    ...catalog,
    billboard: catalog.billboard && isMultiviewSource(catalog.billboard) && selected.has(key(catalog.billboard)) ? catalog.billboard : null,
    all: filter(catalog.all), live: filter(catalog.live), house: filter(catalog.house),
    videos: filter(catalog.videos), shorts: filter(catalog.shorts), broadcasts: filter(catalog.broadcasts),
    clips: filter(catalog.clips), photos: filter(catalog.photos), recent: filter(catalog.recent),
    byMember: catalog.byMember.map((member) => ({ ...member, items: filter(member.items) })),
    byPlatform: Object.fromEntries(Object.entries(catalog.byPlatform).map(([platform, items]) => [platform, filter(items)])) as WatchCatalog["byPlatform"],
    heroFeatured: catalog.heroFeatured?.filter((item) => isMultiviewSource(item) && selected.has(key(item))),
    programmingSections: catalog.programmingSections?.map((section) => ({ ...section, items: filter(section.items) })),
  };
}

export function permittedMultiviewSearchItems(items: readonly WatchItem[], room?: MultiviewLiveRoom): WatchItem[] {
  const playableItems = items.filter(isMultiviewSource);
  if (!room) return playableItems;
  const allowedLive = new Set(room.playableItems.map((item) => item.id));
  return playableItems.filter((item) => item.kind !== "live" || allowedLive.has(item.id));
}
