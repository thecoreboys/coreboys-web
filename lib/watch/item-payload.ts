import type { WatchItem } from "./types";

type PackedWatchItem = Omit<WatchItem, "poster" | "backdrop"> & {
  poster: number;
  backdrop: number;
};

/** Lossless server-to-client transport for overlapping channel/guide lists. */
export type WatchItemPayload = {
  artwork: string[];
  items: PackedWatchItem[];
  lists: Record<string, number[]>;
};

export function packWatchItemLists(lists: Record<string, readonly WatchItem[]>): WatchItemPayload {
  const artwork: string[] = [];
  const artworkIndex = new Map<string, number>();
  const items: PackedWatchItem[] = [];
  const itemIndex = new Map<WatchItem, number>();
  const packedLists: Record<string, number[]> = {};

  const imageIndex = (url: string) => {
    const existing = artworkIndex.get(url);
    if (existing !== undefined) return existing;
    const index = artwork.length;
    artwork.push(url);
    artworkIndex.set(url, index);
    return index;
  };

  for (const [name, list] of Object.entries(lists)) {
    packedLists[name] = list.map((item) => {
      const existing = itemIndex.get(item);
      if (existing !== undefined) return existing;
      const index = items.length;
      // Preserve distinct versions of the same provider ID. Identity, rather
      // than ID alone, is what tells us that two lists share the same item.
      items.push({ ...item, poster: imageIndex(item.poster), backdrop: imageIndex(item.backdrop) });
      itemIndex.set(item, index);
      return index;
    });
  }
  return { artwork, items, lists: packedLists };
}

export function unpackWatchItemLists(payload: WatchItemPayload): Record<string, WatchItem[]> {
  const items: WatchItem[] = payload.items.map((item) => ({
    ...item,
    poster: payload.artwork[item.poster]!,
    backdrop: payload.artwork[item.backdrop]!,
  }));
  return Object.fromEntries(Object.entries(payload.lists).map(([name, list]) => [
    name, list.map((index) => items[index]!),
  ]));
}
