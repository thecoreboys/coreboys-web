import "server-only";
import { query } from "@/lib/db";
import { listWorkspacePreferences } from "@/lib/workspace-preferences";
import { dvrItemReferences } from "./dvr-item-references";
import { resolveHomeItems } from "./home-catalog";
import type { WatchCatalog } from "./types";

/** Private per-request projection. Account references never enter the shared catalog cache. */
export async function getDvrItems(catalog: WatchCatalog, userId: string, allowQueues: boolean) {
  const [saved, queues] = await Promise.all([
    query<{ item_ref: string }>(`SELECT item_ref FROM fan_watch_list WHERE user_id=$1 ORDER BY created_at DESC LIMIT 80`, [userId]).then((result) => result.rows).catch(() => []),
    allowQueues ? listWorkspacePreferences(userId, "watch-queue").catch(() => []) : Promise.resolve([]),
  ]);
  return resolveHomeItems(catalog, dvrItemReferences(saved.map((row) => row.item_ref),
    queues.map((row) => row.payload)));
}
