import type { WatchCatalog, WatchItem, WatchPlatform } from "./types";

const LISTS = ["all", "live", "house", "videos", "shorts", "broadcasts", "clips", "photos", "recent"] as const;
const PLATFORMS: WatchPlatform[] = ["twitch", "youtube", "tiktok", "instagram", "x", "house"];
type ListName = typeof LISTS[number];

/** One item table survives JSON storage without repeating the archive in every shelf. */
export type CompactWatchCatalog = Omit<WatchCatalog,
  ListName | "billboard" | "byMember" | "byPlatform" | "heroFeatured" | "programmingSections"
> & Record<ListName, number[]> & {
  version: 1;
  items: WatchItem[];
  billboard: number | null;
  byMember: Array<Omit<WatchCatalog["byMember"][number], "items"> & { items: number[] }>;
  byPlatform: Record<WatchPlatform, number[]>;
  heroFeatured?: number[];
  programmingSections?: Array<Omit<NonNullable<WatchCatalog["programmingSections"]>[number], "items"> & { items: number[] }>;
};

export function compactWatchCatalog(catalog: WatchCatalog): CompactWatchCatalog {
  const items: WatchItem[] = [];
  const objects = new Map<WatchItem, number>();
  const contents = new Map<string, number>();
  const index = (item: WatchItem): number => {
    const known = objects.get(item);
    if (known !== undefined) return known;
    // Same provider/id can intentionally have different shelf metadata. Only
    // identical JSON content is interned; no override is discarded by id.
    const content = JSON.stringify(item);
    let position = contents.get(content);
    if (position === undefined) {
      position = items.length;
      items.push(item);
      contents.set(content, position);
    }
    objects.set(item, position);
    return position;
  };
  const lists = Object.fromEntries(LISTS.map((key) => [key, catalog[key].map(index)])) as Record<ListName, number[]>;
  return {
    ...catalog,
    ...lists,
    version: 1,
    items,
    billboard: catalog.billboard ? index(catalog.billboard) : null,
    byMember: catalog.byMember.map((member) => ({ ...member, items: member.items.map(index) })),
    byPlatform: Object.fromEntries(PLATFORMS.map((platform) => [platform, catalog.byPlatform[platform].map(index)])) as Record<WatchPlatform, number[]>,
    heroFeatured: catalog.heroFeatured?.map(index),
    programmingSections: catalog.programmingSections?.map((section) => ({ ...section, items: section.items.map(index) })),
  };
}

const expanded = new WeakMap<CompactWatchCatalog, WatchCatalog>();

/** Restore shared references so React Flight can deduplicate repeated shelf entries. */
export function expandWatchCatalog(compact: CompactWatchCatalog): WatchCatalog {
  const known = expanded.get(compact);
  if (known) return known;
  const { version: _version, items, ...metadata } = compact;
  const item = (index: number) => items[index]!;
  const lists = Object.fromEntries(LISTS.map((key) => [key, compact[key].map(item)])) as Record<ListName, WatchItem[]>;
  const catalog: WatchCatalog = {
    ...metadata,
    ...lists,
    billboard: compact.billboard === null ? null : item(compact.billboard),
    byMember: compact.byMember.map((member) => ({ ...member, items: member.items.map(item) })),
    byPlatform: Object.fromEntries(PLATFORMS.map((platform) => [platform, compact.byPlatform[platform].map(item)])) as Record<WatchPlatform, WatchItem[]>,
    heroFeatured: compact.heroFeatured?.map(item),
    programmingSections: compact.programmingSections?.map((section) => ({ ...section, items: section.items.map(item) })),
  };
  expanded.set(compact, catalog);
  return catalog;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isCompactWatchCatalog(value: unknown): value is CompactWatchCatalog {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.items)) return false;
  const count = value.items.length;
  if (!value.items.every((item) => record(item) && typeof item.id === "string"
    && PLATFORMS.includes(item.platform as WatchPlatform) && typeof item.title === "string"
    && typeof item.href === "string" && typeof item.poster === "string" && typeof item.backdrop === "string")) return false;
  const validIndex = (index: unknown) => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < count;
  const validList = (list: unknown) => Array.isArray(list) && list.every(validIndex);
  return LISTS.every((key) => validList(value[key]))
    && (value.billboard === null || validIndex(value.billboard))
    && typeof value.fetchedAt === "string" && record(value.liveCapabilities)
    && Array.isArray(value.byMember) && value.byMember.every((member) => record(member)
      && typeof member.slug === "string" && typeof member.label === "string" && validList(member.items))
    && record(value.byPlatform) && PLATFORMS.every((platform) => validList((value.byPlatform as Record<string, unknown>)[platform]))
    && (value.heroFeatured === undefined || validList(value.heroFeatured))
    && (value.programmingSections === undefined || (Array.isArray(value.programmingSections)
      && value.programmingSections.every((section) => record(section) && typeof section.id === "string"
        && typeof section.title === "string" && validList(section.items))));
}
