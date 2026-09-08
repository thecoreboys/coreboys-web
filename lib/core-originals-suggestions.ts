import "server-only";
import { withTransaction } from "./db";
import { ensureCoreOriginalsSchema, getCoreOriginalSnapshot } from "./core-originals";
import { originalMatchReason, originalSourceKey } from "./core-originals-matching";
import { getWatchCatalog } from "./watch/catalog";
import type { WatchItem } from "./watch/types";

/** Serializes suggestions per collection and preserves every prior editorial decision. */
export async function suggestOriginalItems(originalId: string, candidates: Array<{ item: WatchItem; reason: string }>, submittedBy: string | null = null) {
  await ensureCoreOriginalsSchema();
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), 701)", [originalId]);
    const existing = await client.query<{ source_url: string }>("SELECT source_url FROM core_original_items WHERE original_id=$1", [originalId]);
    const seen = new Set(existing.rows.map((row) => originalSourceKey(row.source_url)).filter(Boolean));
    let added = 0;
    for (const { item, reason } of candidates) {
      if (added >= 12) break;
      const sourceUrl = item.sourceUrl ?? item.href;
      const key = originalSourceKey(sourceUrl);
      if (!key || seen.has(key)) continue;
      await client.query(`INSERT INTO core_original_items
        (original_id,source_url,platform,title,subtitle,poster_url,format,status,recommendation_note,submitted_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`, [
        originalId, sourceUrl, item.platform === "house" ? "other" : item.platform,
        item.title, item.subtitle ?? null, item.poster ?? null,
        item.format === "photo" ? "photo" : item.format === "short" ? "short" : "long",
        reason.slice(0, 500), submittedBy,
      ]);
      seen.add(key);
      added += 1;
    }
    return added;
  });
}

/** Zero paid requests: exact title rules seed the existing human approval queue. */
export async function runOriginalSuggestions() {
  const [catalog, snapshot] = await Promise.all([getWatchCatalog(), getCoreOriginalSnapshot(true)]);
  const ordered = [...catalog.all].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
  let added = 0;
  let collections = 0;
  for (const original of snapshot.originals.filter((entry) => entry.enabled)) {
    if (snapshot.items.filter((item) => item.originalId === original.id && item.status === "pending").length >= 36) continue;
    const matches = ordered.flatMap((item) => {
      const reason = originalMatchReason(original.slug, item);
      return reason ? [{ item, reason }] : [];
    });
    if (!matches.length) continue;
    added += await suggestOriginalItems(original.id, matches);
    collections += 1;
  }
  return { added, collections, mode: "metadata-rules", publication: "approval-required" };
}
