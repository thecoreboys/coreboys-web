import "server-only";
import type { WatchItem } from "@/lib/watch/types";
import { mediaIntelligenceQuery } from "./schema";

const WATCH_ARCHIVE_ITEM_LIMIT = 20_000;

/** Read normalized public records without importing the ingestion/analysis runtime. */
export async function loadArchivedYouTubeWatchItems(limit = WATCH_ARCHIVE_ITEM_LIMIT): Promise<WatchItem[]> {
  const bounded = Math.max(1, Math.min(WATCH_ARCHIVE_ITEM_LIMIT, Math.trunc(limit)));
  try {
    const result = await mediaIntelligenceQuery<{ item: WatchItem }>(
      `SELECT item
         FROM media_intelligence_assets
        WHERE active
          AND platform = 'youtube'
          AND item IS NOT NULL
        ORDER BY published_at DESC NULLS LAST, updated_at DESC
        LIMIT $1`,
      [bounded],
    );
    return result.rows.flatMap(({ item }) => {
      if (!item || item.platform !== "youtube" || !item.id || !item.title || !item.href) return [];
      return [item];
    });
  } catch {
    // The archive database is optional during staged rollout.
    return [];
  }
}
