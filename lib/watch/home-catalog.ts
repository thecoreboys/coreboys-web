import type { WatchCatalog, WatchItem } from "./types";

export const HOME_CATALOG_ITEM_LIMIT = 720;
const key = (item: WatchItem) => `${item.platform}:${item.id}`;

function balanced(items: readonly WatchItem[], limit: number) {
  const buckets = new Map<string, WatchItem[]>();
  for (const item of items) {
    const group = `${item.memberSlug ?? "house"}:${item.platform}:${item.accountLabel ?? ""}:${item.format ?? item.kind}`;
    const bucket = buckets.get(group) ?? [];
    bucket.push(item);
    buckets.set(group, bucket);
  }
  const result: WatchItem[] = [];
  for (let depth = 0; result.length < limit; depth++) {
    let found = false;
    for (const bucket of buckets.values()) {
      const item = bucket[depth];
      if (!item) continue;
      found = true;
      result.push(item);
      if (result.length === limit) break;
    }
    if (!found) break;
  }
  return result;
}

/** Homepage rails need a balanced preview, while full archives remain on the server. */
export function projectHomeCatalog(catalog: WatchCatalog): WatchCatalog {
  const selected = new Set<string>();
  const add = (items: readonly WatchItem[]) => items.forEach((item) => selected.add(key(item)));
  add(catalog.live);
  add(catalog.heroFeatured ?? []);
  if (catalog.billboard) add([catalog.billboard]);
  add(catalog.all.filter((item) => item.programming?.curatedItemId));
  // Reserve enough candidates for every visible 24–30 item rail, including
  // smaller accounts that a global newest-first slice would remove entirely.
  const rails = [catalog.house, catalog.videos, catalog.shorts, catalog.broadcasts,
    catalog.clips, catalog.photos, catalog.byPlatform.x,
    ...catalog.byMember.map((member) => member.items),
    ...(catalog.programmingSections ?? []).map((section) => section.items)];
  const candidates = rails.map((rail) => balanced(rail, 36));
  for (let depth = 0; depth < 36 && selected.size < HOME_CATALOG_ITEM_LIMIT; depth++) {
    for (const rail of candidates) {
      const item = rail[depth];
      if (item) selected.add(key(item));
      if (selected.size >= HOME_CATALOG_ITEM_LIMIT) break;
    }
  }
  for (const item of balanced(catalog.all, HOME_CATALOG_ITEM_LIMIT)) {
    if (selected.size >= HOME_CATALOG_ITEM_LIMIT) break;
    selected.add(key(item));
  }
  const filter = (items: WatchItem[]) => items.filter((item) => selected.has(key(item)));
  return {
    ...catalog,
    all: filter(catalog.all), live: filter(catalog.live), house: filter(catalog.house),
    videos: filter(catalog.videos), shorts: filter(catalog.shorts), broadcasts: filter(catalog.broadcasts),
    clips: filter(catalog.clips), photos: filter(catalog.photos), recent: filter(catalog.recent),
    byMember: catalog.byMember.map((member) => ({ ...member, items: filter(member.items) })),
    byPlatform: Object.fromEntries(Object.entries(catalog.byPlatform).map(([platform, items]) => [platform, filter(items)])) as WatchCatalog["byPlatform"],
    programmingSections: catalog.programmingSections?.map((section) => ({ ...section, items: filter(section.items) })),
  };
}

export function homeItemReferences(item: WatchItem): string[] {
  const refs = new Set([item.id, key(item)]);
  if (item.platform === "youtube") {
    for (const href of [item.href, item.sourceUrl]) {
      if (!href) continue;
      try {
        const url = new URL(href, "https://core.local");
        const id = url.hostname === "youtu.be" ? url.pathname.split("/")[1]
          : /\/(?:shorts|embed)\/([\w-]+)/.exec(url.pathname)?.[1]
            ?? url.searchParams.get("v")
            ?? ((url.searchParams.get("kind") === "youtube" || url.searchParams.get("src") === "youtube") ? url.searchParams.get("id") : null);
        if (id && /^[\w-]{6,}$/.test(id)) refs.add(id);
      } catch { /* An item can still resolve by its catalog identity. */ }
    }
  }
  return [...refs];
}

/** Exact public metadata lookup; no account history or entitlement data is returned. */
export function resolveHomeItems(catalog: WatchCatalog, references: readonly string[]): WatchItem[] {
  const wanted = new Set(references);
  return catalog.all.filter((item) => homeItemReferences(item).some((reference) => wanted.has(reference)));
}

export function mergeHomeItems(base: readonly WatchItem[], additional: readonly WatchItem[]): WatchItem[] {
  const known = new Set(base.map(key));
  return [...base, ...additional.filter((item) => {
    if (known.has(key(item))) return false;
    known.add(key(item));
    return true;
  })];
}
