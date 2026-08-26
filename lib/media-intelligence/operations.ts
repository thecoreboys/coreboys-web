import "server-only";

import { runMediaArchiveBackfillBatch } from "./archive";
import { runCurrentWatchCatalogSync } from "./ingest";
import { publishMediaIndexGeneration } from "./indexing";
import { runMediaIntelligenceRetention } from "./retention";

type MaintenanceStep<T> =
  | { ok: true; result: T }
  | { ok: false; error: string };

async function runStep<T>(work: () => Promise<T>): Promise<MaintenanceStep<T>> {
  try {
    return { ok: true, result: await work() };
  } catch (error) {
    return { ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 2_000) };
  }
}

/**
 * One protected cron transaction boundary. Steps are failure-isolated so a
 * provider outage cannot prevent rights/tombstone cleanup from running; index
 * publication always runs last over the post-cleanup searchable set.
 */
export async function runScheduledMediaMaintenance(options: {
  maxJobs?: number;
  maxArchivePages?: number;
  archivePageSize?: number;
  retentionLimit?: number;
} = {}) {
  const sync = await runStep(() => runCurrentWatchCatalogSync({
    trigger: "scheduled",
    maxJobs: options.maxJobs ?? 100,
  }));
  const archive = await runStep(() => runMediaArchiveBackfillBatch({
    workerId: `scheduled-archive:${Date.now()}`,
    maxPages: options.maxArchivePages ?? 8,
    pageSize: options.archivePageSize ?? 50,
    maxJobs: options.maxJobs ?? 100,
  }));
  const cleanup = await runStep(() => runMediaIntelligenceRetention(options.retentionLimit ?? 250));
  const index = await runStep(() => publishMediaIndexGeneration());
  const steps = { sync, archive, cleanup, index };
  return {
    ok: Object.values(steps).every((step) => step.ok),
    steps,
    completedAt: new Date().toISOString(),
  };
}
