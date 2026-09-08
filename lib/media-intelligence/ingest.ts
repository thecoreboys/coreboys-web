import "server-only";
import type { WatchCatalog, WatchItem } from "@/lib/watch/types";
import { getWatchCatalog } from "@/lib/watch/catalog";
import {
  getLocalMetadataAnalyzer,
  getRegisteredMediaAnalyzer,
  prepareWatchItem,
} from "./analyzer";
import { contentFingerprint } from "./fingerprint";
import { enqueueAnalysisJob, upsertSourcePolicy } from "./jobs";
import { analysisEligibilityFor } from "./policy";
import { getMediaIntelligenceStore } from "./postgres-store";
import { mediaIntelligenceQuery } from "./schema";
import { runMediaWorkerBatch, type MediaWorkerSummary } from "./worker";

export type IndexSummary = {
  discovered: number;
  analyzed: number;
  unchanged: number;
  busy: number;
  failed: number;
  queued: number;
  skipped: number;
  metadataOnly: number;
};

const emptySummary = (): IndexSummary => ({
  discovered: 0,
  analyzed: 0,
  unchanged: 0,
  busy: 0,
  failed: 0,
  queued: 0,
  skipped: 0,
  metadataOnly: 0,
});

export async function indexWatchItem(item: WatchItem): Promise<"analyzed" | "unchanged" | "busy"> {
  const store = getMediaIntelligenceStore();
  const eligibility = analysisEligibilityFor(item);
  const registered = eligibility.deepMediaAllowed ? getRegisteredMediaAnalyzer() : null;
  const analyzer = registered?.mode === "deep" ? registered : getLocalMetadataAnalyzer();
  const prepared = prepareWatchItem(item, analyzer);
  await store.prepareRevision(prepared.asset, prepared.revision);
  const claim = await store.claimAnalysis(prepared.claim);
  if (claim === "complete") return "unchanged";
  if (claim === "busy") return "busy";
  try {
    const completed = await analyzer.analyze(
      item,
      prepared.asset,
      prepared.revision,
      prepared.claim,
    );
    await store.completeAnalysis(completed);
    return "analyzed";
  } catch (error) {
    await store.failAnalysis(prepared.claim, error);
    throw error;
  }
}

export async function indexWatchCatalog(catalog: WatchCatalog): Promise<IndexSummary> {
  const summary: IndexSummary = {
    discovered: catalog.all.length,
    analyzed: 0,
    unchanged: 0,
    busy: 0,
    failed: 0,
    queued: 0,
    skipped: 0,
    metadataOnly: 0,
  };
  const concurrency = 6;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, catalog.all.length) }, async () => {
    while (cursor < catalog.all.length) {
      const index = cursor;
      cursor += 1;
      const item = catalog.all[index];
      if (!item) continue;
      try {
        const result = await indexWatchItem(item);
        summary[result] += 1;
      } catch {
        summary.failed += 1;
      }
    }
  }));
  // The homepage catalog is deliberately bounded and is not deletion proof.
  // Archive disappearance is handled by explicit provider/admin tombstones.
  return summary;
}

export async function queueWatchItems(items: readonly WatchItem[]): Promise<IndexSummary> {
  const store = getMediaIntelligenceStore();
  const summary = { ...emptySummary(), discovered: items.length };
  const uniqueItems = [...new Map(items.map((item) => [`${item.platform}:${item.id}`, item])).values()];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(3, uniqueItems.length) }, async () => {
  while (cursor < uniqueItems.length) {
    const item = uniqueItems[cursor++]!;
    const eligibility = analysisEligibilityFor(item);
    if (eligibility.mode === "skip") {
      try {
        await upsertSourcePolicy(eligibility.policy);
        summary.skipped += 1;
      } catch {
        summary.failed += 1;
      }
      continue;
    }
    if (eligibility.mode === "metadata-only") summary.metadataOnly += 1;
    try {
      const analyzers = [
        getLocalMetadataAnalyzer(),
        ...(eligibility.deepMediaAllowed
          ? [getRegisteredMediaAnalyzer()].filter((value): value is NonNullable<typeof value> => Boolean(value?.mode === "deep"))
          : []),
      ];
      for (const analyzer of analyzers) {
        const prepared = prepareWatchItem(item, analyzer);
        await store.prepareRevision(prepared.asset, prepared.revision);
        const queued = await enqueueAnalysisJob({
          assetKey: prepared.asset.key,
          claim: prepared.claim,
          policy: eligibility.policy,
          analysisItem: prepared.asset.item,
          priority: item.kind === "live" ? 10
            : Date.parse(item.publishedAt ?? "") >= Date.now() - 2 * 86_400_000 ? 25 : 100,
          processingItem: eligibility.deepMediaAllowed && analyzer.mode === "deep"
            ? {
                mediaUrl: item.mediaUrl,
                qualities: item.qualities,
                captions: item.captions,
                audioDescriptionUrl: item.audioDescriptionUrl,
              }
            : undefined,
        });
        if (queued === "queued") summary.queued += 1;
        else summary.unchanged += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }
  }));
  return summary;
}

export async function queueWatchCatalog(catalog: WatchCatalog): Promise<IndexSummary> {
  return queueWatchItems(catalog.all);
}

export type CatalogSyncResult = IndexSummary & {
  syncId: string;
  trigger: "scheduled" | "admin" | "manual";
  worker: MediaWorkerSummary;
  catalogSize: number;
  nextCatalogCursor: string | null;
};

/**
 * Mutation entry point for cron/admin workers. Visitor search requests never
 * call this function and therefore never discover, queue, or analyze media.
 */
export async function runCurrentWatchCatalogSync(options: {
  trigger?: CatalogSyncResult["trigger"];
  maxJobs?: number;
} = {}): Promise<CatalogSyncResult> {
  const trigger = options.trigger ?? "scheduled";
  const syncId = contentFingerprint({ trigger, startedAt: new Date().toISOString() });
  await mediaIntelligenceQuery(
    `INSERT INTO media_intelligence_catalog_syncs (sync_id, trigger, status)
     VALUES ($1,$2,'running')`,
    [syncId, trigger],
  );
  try {
    const catalog = await getWatchCatalog();
    // Resume a bounded slice. A large archive must not occupy one HTTP request
    // until the gateway times out and then restart from the first asset.
    const previous = await mediaIntelligenceQuery<{ cursor: string | null }>(
      `SELECT summary->>'nextCatalogCursor' AS cursor
         FROM media_intelligence_catalog_syncs
        WHERE status = 'succeeded' ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
    );
    const key = (item: WatchItem) => `${item.platform}:${item.id}`;
    const ordered = [...new Map(catalog.all.map((item) => [key(item), item])).values()]
      .sort((a, b) => key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
    const cursor = previous.rows[0]?.cursor;
    const remaining = cursor ? ordered.filter((item) => key(item) > cursor) : ordered;
    const archiveSlice = (remaining.length ? remaining : ordered).slice(0, 75);
    const recent = ordered.filter((item) => item.kind === "live" || Date.parse(item.publishedAt ?? "") >= Date.now() - 2 * 86_400_000)
      .sort((a, b) => Number(b.kind === "live") - Number(a.kind === "live") || Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0"))
      .slice(0, 25);
    const batch = [...new Map([...recent, ...archiveSlice].map((item) => [key(item), item])).values()];
    const hasMore = (remaining.length || ordered.length) > archiveSlice.length;
    const queued = await queueWatchItems(batch);
    const worker = await runMediaWorkerBatch({
      workerId: `catalog-sync:${syncId}`,
      maxJobs: options.maxJobs ?? Math.max(queued.queued, 50),
    });
    const result: CatalogSyncResult = {
      ...queued,
      analyzed: worker.analyzed,
      busy: Math.max(0, worker.claimed - worker.analyzed - worker.unchanged - worker.failed),
      failed: queued.failed + worker.failed,
      unchanged: queued.unchanged + worker.unchanged,
      syncId,
      trigger,
      worker,
      catalogSize: ordered.length,
      nextCatalogCursor: hasMore && archiveSlice.length ? key(archiveSlice[archiveSlice.length - 1]!) : null,
    };
    await mediaIntelligenceQuery(
      `UPDATE media_intelligence_catalog_syncs SET status = $3, summary = $2::jsonb,
       finished_at = now() WHERE sync_id = $1`,
      [syncId, JSON.stringify(result), result.failed ? "failed" : "succeeded"],
    );
    return result;
  } catch (error) {
    await mediaIntelligenceQuery(
      `UPDATE media_intelligence_catalog_syncs SET status = 'failed', error = $2,
       finished_at = now() WHERE sync_id = $1`,
      [syncId, (error instanceof Error ? error.message : String(error)).slice(0, 2_000)],
    ).catch(() => {});
    throw error;
  }
}

/**
 * Backward-compatible read-only status used by the search response. The
 * former implementation analyzed the catalog during a visitor request.
 */
export async function syncCurrentWatchCatalog(_force = false): Promise<IndexSummary> {
  const result = await mediaIntelligenceQuery<{ summary: IndexSummary }>(
    `SELECT summary FROM media_intelligence_catalog_syncs
     WHERE status = 'succeeded' ORDER BY finished_at DESC NULLS LAST LIMIT 1`,
  );
  return result.rows[0]?.summary ?? emptySummary();
}
