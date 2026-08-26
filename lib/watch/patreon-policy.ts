import type { PatreonLockedItem } from "./types";

/**
 * Keeps every distinct video post discovered in Patreon's public teaser
 * metadata. Benefit copy and other non-post records never enter the rail.
 */
export function selectPublicPatreonVideoPosts(
  discoveredVideoPosts: readonly PatreonLockedItem[],
): PatreonLockedItem[] {
  const seenHrefs = new Set<string>();
  const selected: PatreonLockedItem[] = [];

  for (const item of discoveredVideoPosts) {
    if (item.kind !== "post" || seenHrefs.has(item.href)) continue;
    seenHrefs.add(item.href);
    selected.push({ ...item, label: "Exclusive video" });
  }

  return selected;
}
