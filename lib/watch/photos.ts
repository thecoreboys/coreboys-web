import type { WatchItem } from "./types";

function publishedTime(item: WatchItem): number {
  const parsed = Date.parse(item.publishedAt ?? "");
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function photoSourceKey(item: WatchItem): string {
  return `${item.memberSlug ?? "core"}:${item.accountLabel ?? item.memberLabel}`;
}

/**
 * Build the Watch Photos shelf from official Instagram image posts only.
 *
 * Items are first normalized newest-first, then selected in source rounds.
 * This preserves recency inside each account while ensuring CORE and each
 * connected member account can appear before a prolific source repeats.
 */
export function instagramPhotoShelfItems(items: readonly WatchItem[]): WatchItem[] {
  // The catalog feeds are already normalized individually. Re-sort the merged
  // CORE/member slice here before balancing their source queues.
  const photos = items
    .filter((item) => item.platform === "instagram" && item.format === "photo")
    .slice()
    .sort((left, right) => {
      const dateDelta = publishedTime(right) - publishedTime(left);
      return dateDelta || left.id.localeCompare(right.id);
    });
  const queues = new Map<string, WatchItem[]>();

  for (const item of photos) {
    const key = photoSourceKey(item);
    const queue = queues.get(key);
    if (queue) queue.push(item);
    else queues.set(key, [item]);
  }

  const sources = [...queues.values()];
  const balanced: WatchItem[] = [];
  let round = 0;

  while (balanced.length < photos.length) {
    let added = false;
    for (const source of sources) {
      const item = source[round];
      if (!item) continue;
      balanced.push(item);
      added = true;
    }
    if (!added) break;
    round += 1;
  }

  return balanced;
}
