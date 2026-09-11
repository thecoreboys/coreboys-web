import { itemToPlayable, type Playable } from "./playable";
import type { WatchCatalog, WatchPlatform } from "./types";

// The player keeps 30 recommendations. Extra candidates allow for current,
// previously watched, and already queued items without transferring the archive.
export const WATCH_CHROME_RECOMMENDATION_LIMIT = 90;
export type WatchChromeSnapshot = {
  fetchedAt: string;
  live: Array<{ id: string; platform: WatchPlatform; memberSlug: string | null; login: string | null; dvrVodId: string | null }>;
  recommendations: Playable[];
};

export function watchChromeSnapshot(catalog: WatchCatalog): WatchChromeSnapshot {
  const recommendations: Playable[] = [];
  const seen = new Set<string>();
  for (const item of [...catalog.live, ...catalog.all]) {
    const playable = itemToPlayable(item);
    if (!playable || seen.has(playable.key) || (item.embeddable === false && !playable.mediaUrl && !playable.embedUrl)) continue;
    seen.add(playable.key);
    recommendations.push(playable);
    if (recommendations.length >= WATCH_CHROME_RECOMMENDATION_LIMIT) break;
  }
  return {
    fetchedAt: catalog.fetchedAt,
    live: catalog.live.map((item) => ({ id: item.id, platform: item.platform, memberSlug: item.memberSlug,
      login: item.live?.login?.toLowerCase() ?? null, dvrVodId: item.dvr?.twitchVodId ?? null })),
    recommendations,
  };
}
