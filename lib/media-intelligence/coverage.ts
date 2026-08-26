import "server-only";
import { azureMediaRuntimeState } from "./azure";
import { mediaIntelligenceQuery } from "./schema";

export async function mediaIntelligenceCoverage() {
  const [assets, policies, jobs, runs, operations] = await Promise.all([
    mediaIntelligenceQuery<{ platform: string; total: string; active: string }>(
      `SELECT platform, count(*)::text AS total,
              count(*) FILTER (WHERE active)::text AS active
       FROM media_intelligence_assets GROUP BY platform ORDER BY platform`,
    ),
    mediaIntelligenceQuery<{ platform: string; rights_status: string; analysis_mode: string; total: string }>(
      `SELECT platform, rights_status, analysis_mode, count(*)::text AS total
       FROM media_intelligence_source_policies
       GROUP BY platform, rights_status, analysis_mode
       ORDER BY platform, rights_status, analysis_mode`,
    ),
    mediaIntelligenceQuery<{ stage: string; status: string; total: string }>(
      `SELECT stage, status, count(*)::text AS total
       FROM media_intelligence_jobs GROUP BY stage, status ORDER BY stage, status`,
    ),
    mediaIntelligenceQuery<{ stage: string; status: string; total: string }>(
      `SELECT stage, status, count(*)::text AS total
       FROM media_intelligence_analysis_runs GROUP BY stage, status ORDER BY stage, status`,
    ),
    mediaIntelligenceQuery<{
      artifacts: string; tombstones_pending: string; outbox_pending: string;
      dead_letters: string; active_generation: string;
    }>(`SELECT
      (SELECT count(*) FROM media_intelligence_artifacts)::text AS artifacts,
      (SELECT count(*) FROM media_intelligence_tombstones WHERE processed_at IS NULL)::text AS tombstones_pending,
      (SELECT count(*) FROM media_intelligence_outbox WHERE status <> 'published')::text AS outbox_pending,
      (SELECT count(*) FROM media_intelligence_jobs WHERE status = 'dead-letter')::text AS dead_letters,
      (SELECT count(*) FROM media_intelligence_index_generations WHERE status = 'active')::text AS active_generation`),
  ]);
  const op = operations.rows[0];
  return {
    generatedAt: new Date().toISOString(),
    runtime: azureMediaRuntimeState(),
    assets: assets.rows.map((row) => ({ platform: row.platform, total: Number(row.total), active: Number(row.active) })),
    policies: policies.rows.map((row) => ({
      platform: row.platform,
      rights: row.rights_status,
      mode: row.analysis_mode,
      total: Number(row.total),
    })),
    jobs: jobs.rows.map((row) => ({ stage: row.stage, status: row.status, total: Number(row.total) })),
    runs: runs.rows.map((row) => ({ stage: row.stage, status: row.status, total: Number(row.total) })),
    operations: {
      artifacts: Number(op?.artifacts ?? 0),
      pendingTombstones: Number(op?.tombstones_pending ?? 0),
      pendingOutbox: Number(op?.outbox_pending ?? 0),
      deadLetters: Number(op?.dead_letters ?? 0),
      activeGenerations: Number(op?.active_generation ?? 0),
    },
  };
}
