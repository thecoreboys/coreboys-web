import "server-only";
import type { WatchItem } from "@/lib/watch/types";
import { getAzureMediaAdapters } from "./azure";
import { withMediaIntelligenceTransaction, mediaIntelligenceQuery } from "./schema";
import type {
  AnalysisClaim,
  MediaAnalysisStage,
  MediaIntelligenceJob,
  MediaSourcePolicy,
} from "./types";

type JobRow = {
  job_id: string;
  idempotency_key: string;
  asset_key: string;
  revision_id: string;
  stage: MediaAnalysisStage;
  analyzer: string;
  analyzer_version: string;
  status: MediaIntelligenceJob["status"];
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  payload: Record<string, unknown>;
};

type MediaProcessingInput = Pick<
  WatchItem,
  "mediaUrl" | "qualities" | "captions" | "audioDescriptionUrl"
>;

function processingInputFor(item: MediaProcessingInput | undefined): MediaProcessingInput | undefined {
  if (!item) return undefined;
  const processing: MediaProcessingInput = {};
  if (item.mediaUrl) processing.mediaUrl = item.mediaUrl;
  if (item.audioDescriptionUrl) processing.audioDescriptionUrl = item.audioDescriptionUrl;
  if (item.qualities?.length) processing.qualities = item.qualities;
  if (item.captions?.length) processing.captions = item.captions;
  return Object.keys(processing).length > 0 ? processing : undefined;
}

function rowToJob(row: JobRow): MediaIntelligenceJob {
  return {
    id: row.job_id,
    idempotencyKey: row.idempotency_key,
    assetKey: row.asset_key,
    revisionId: row.revision_id,
    stage: row.stage,
    analyzer: row.analyzer,
    analyzerVersion: row.analyzer_version,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    payload: row.payload,
  };
}

export async function upsertSourcePolicy(policy: MediaSourcePolicy): Promise<void> {
  await mediaIntelligenceQuery(
    `INSERT INTO media_intelligence_source_policies
      (source_key, platform, rights_status, analysis_mode, media_access_allowed,
       retention_days, policy_version, reason, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     ON CONFLICT (source_key) DO UPDATE SET
       platform = EXCLUDED.platform, rights_status = EXCLUDED.rights_status,
       analysis_mode = EXCLUDED.analysis_mode,
       media_access_allowed = EXCLUDED.media_access_allowed,
       retention_days = EXCLUDED.retention_days,
       policy_version = EXCLUDED.policy_version, reason = EXCLUDED.reason,
       updated_at = now()`,
    [
      policy.key, policy.platform, policy.rights, policy.requestedMode,
      policy.mediaAccessAllowed, policy.retentionDays, policy.version, policy.reason,
    ],
  );
  await mediaIntelligenceQuery(
    `UPDATE media_intelligence_jobs job
        SET status = 'cancelled', finished_at = now(), updated_at = now(),
            lease_owner = NULL, lease_expires_at = NULL,
            last_error = 'source_policy_no_longer_authorized'
      WHERE job.status IN ('queued','failed')
        AND EXISTS (
          SELECT 1 FROM media_intelligence_assets asset
          WHERE asset.asset_key = job.asset_key AND asset.source_policy_key = $1
        )
        AND (
          $2 = 'restricted' OR $3 = 'skip'
          OR (job.stage <> 'metadata' AND ($3 <> 'deep' OR $4 = false OR $2 NOT IN ('owned','licensed')))
        )`,
    [policy.key, policy.rights, policy.requestedMode, policy.mediaAccessAllowed],
  );
}

export async function enqueueAnalysisJob(input: {
  assetKey: string;
  claim: AnalysisClaim;
  policy: MediaSourcePolicy;
  /**
   * Server-only processing URLs. Public asset.item rows are intentionally
   * redacted; workers recover authorized inputs from this private job payload.
   */
  processingItem?: MediaProcessingInput;
  priority?: number;
}): Promise<"queued" | "existing"> {
  return withMediaIntelligenceTransaction(async (client) => {
    await client.query(
      `INSERT INTO media_intelligence_source_policies
        (source_key, platform, rights_status, analysis_mode, media_access_allowed,
         retention_days, policy_version, reason, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
       ON CONFLICT (source_key) DO UPDATE SET
         platform = EXCLUDED.platform, rights_status = EXCLUDED.rights_status,
         analysis_mode = EXCLUDED.analysis_mode,
         media_access_allowed = EXCLUDED.media_access_allowed,
         retention_days = EXCLUDED.retention_days,
         policy_version = EXCLUDED.policy_version, reason = EXCLUDED.reason,
         updated_at = now()`,
      [
        input.policy.key, input.policy.platform, input.policy.rights,
        input.policy.requestedMode, input.policy.mediaAccessAllowed,
        input.policy.retentionDays, input.policy.version, input.policy.reason,
      ],
    );
    await client.query(
      `UPDATE media_intelligence_jobs job
          SET status = 'cancelled', finished_at = now(), updated_at = now(),
              lease_owner = NULL, lease_expires_at = NULL,
              last_error = 'source_policy_no_longer_authorized'
        WHERE job.status IN ('queued','failed')
          AND EXISTS (
            SELECT 1 FROM media_intelligence_assets asset
            WHERE asset.asset_key = job.asset_key AND asset.source_policy_key = $1
          )
          AND (
            $2 = 'restricted' OR $3 = 'skip'
            OR (job.stage <> 'metadata' AND ($3 <> 'deep' OR $4 = false OR $2 NOT IN ('owned','licensed')))
          )`,
      [input.policy.key, input.policy.rights, input.policy.requestedMode, input.policy.mediaAccessAllowed],
    );
    const result = await client.query(
      `INSERT INTO media_intelligence_jobs
        (job_id, idempotency_key, asset_key, revision_id, stage, analyzer,
         analyzer_version, status, priority, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',$8,$9::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING job_id`,
      [
        input.claim.id, input.claim.idempotencyKey, input.assetKey,
        input.claim.revisionId, input.claim.stage, input.claim.analyzer,
        input.claim.analyzerVersion, input.priority ?? 100,
        JSON.stringify({
          policyKey: input.policy.key,
          policyVersion: input.policy.version,
          inputHash: input.claim.inputHash,
          processing: processingInputFor(input.processingItem),
        }),
      ],
    );
    if (!result.rowCount) {
      const processing = processingInputFor(input.processingItem);
      if (processing) {
        await client.query(
          `UPDATE media_intelligence_jobs
              SET payload = jsonb_set(payload, '{processing}', $2::jsonb, true), updated_at = now()
            WHERE idempotency_key = $1 AND status IN ('queued','failed')`,
          [input.claim.idempotencyKey, JSON.stringify(processing)],
        );
      }
      return "existing";
    }
    await client.query(
      `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload)
       VALUES ($1, 'media.analysis.queued', $2, $3::jsonb)
       ON CONFLICT (topic, event_key) DO NOTHING`,
      [
        `queued:${input.claim.id}`, input.claim.idempotencyKey,
        JSON.stringify({ jobId: input.claim.id, assetKey: input.assetKey, stage: input.claim.stage }),
      ],
    );
    return "queued";
  });
}

export async function claimNextAnalysisJob(
  workerId: string,
  stages: readonly MediaAnalysisStage[] = ["metadata"],
  leaseSeconds = 300,
): Promise<MediaIntelligenceJob | null> {
  const result = await withMediaIntelligenceTransaction((client) => client.query<JobRow>(
    `WITH candidate AS (
       SELECT job.job_id FROM media_intelligence_jobs job
       JOIN media_intelligence_assets asset ON asset.asset_key = job.asset_key
       JOIN media_intelligence_source_policies policy ON policy.source_key = asset.source_policy_key
       WHERE job.stage = ANY($1::text[])
         AND job.available_at <= now()
         AND asset.active = true
         AND policy.rights_status <> 'restricted'
         AND policy.analysis_mode <> 'skip'
         AND (
           job.stage = 'metadata'
           OR (
             policy.analysis_mode = 'deep' AND policy.media_access_allowed = true
             AND policy.rights_status IN ('owned','licensed')
           )
         )
         AND (
           job.status IN ('queued','failed')
           OR (job.status = 'running' AND job.lease_expires_at < now())
         )
         AND job.attempts < job.max_attempts
       ORDER BY job.priority ASC, job.available_at ASC, job.created_at ASC
       FOR UPDATE OF job SKIP LOCKED
       LIMIT 1
     )
     UPDATE media_intelligence_jobs j
        SET status = 'running', attempts = attempts + 1, lease_owner = $2,
            lease_expires_at = now() + ($3::text || ' seconds')::interval,
            updated_at = now(), last_error = NULL
       FROM candidate
      WHERE j.job_id = candidate.job_id
     RETURNING j.*`,
    [stages, workerId.slice(0, 160), Math.max(30, Math.min(3600, Math.trunc(leaseSeconds)))],
  ));
  return result.rows[0] ? rowToJob(result.rows[0]) : null;
}

export async function loadMediaJobItem(job: MediaIntelligenceJob): Promise<WatchItem | null> {
  const result = await mediaIntelligenceQuery<{ item: WatchItem }>(
    `SELECT a.item FROM media_intelligence_assets a
     JOIN media_intelligence_revisions r ON r.asset_key = a.asset_key
     WHERE a.asset_key = $1 AND r.revision_id = $2 LIMIT 1`,
    [job.assetKey, job.revisionId],
  );
  const item = result.rows[0]?.item;
  if (!item) return null;
  const processing = processingInputFor(
    job.payload.processing && typeof job.payload.processing === "object"
      ? job.payload.processing as MediaProcessingInput
      : undefined,
  );
  return processing ? { ...item, ...processing } : item;
}

export async function renewAnalysisJobLease(
  jobId: string,
  workerId: string,
  leaseSeconds = 300,
): Promise<boolean> {
  const result = await mediaIntelligenceQuery(
    `UPDATE media_intelligence_jobs job
        SET lease_expires_at = now() + ($3::text || ' seconds')::interval,
            updated_at = now()
       FROM media_intelligence_assets asset
       JOIN media_intelligence_source_policies policy ON policy.source_key = asset.source_policy_key
      WHERE job.job_id = $1 AND job.status = 'running' AND job.lease_owner = $2
        AND asset.asset_key = job.asset_key AND asset.active = true
        AND policy.rights_status <> 'restricted' AND policy.analysis_mode <> 'skip'
        AND (
          job.stage = 'metadata'
          OR (
            policy.analysis_mode = 'deep' AND policy.media_access_allowed = true
            AND policy.rights_status IN ('owned','licensed')
          )
        )
      RETURNING job.job_id`,
    [jobId, workerId.slice(0, 160), Math.max(30, Math.min(3_600, Math.trunc(leaseSeconds)))],
  );
  return Boolean(result.rowCount);
}

export async function completeAnalysisJob(
  job: MediaIntelligenceJob,
  workerId: string,
): Promise<boolean> {
  const result = await mediaIntelligenceQuery(
    `UPDATE media_intelligence_jobs job SET status = 'succeeded', lease_owner = NULL,
       lease_expires_at = NULL, finished_at = now(), updated_at = now()
     FROM media_intelligence_assets asset
     JOIN media_intelligence_source_policies policy ON policy.source_key = asset.source_policy_key
     WHERE job.job_id = $1 AND job.status = 'running' AND job.lease_owner = $2
       AND asset.asset_key = job.asset_key AND asset.active = true
       AND policy.rights_status <> 'restricted' AND policy.analysis_mode <> 'skip'
       AND (
         job.stage = 'metadata'
         OR (
           policy.analysis_mode = 'deep' AND policy.media_access_allowed = true
           AND policy.rights_status IN ('owned','licensed')
         )
       )
     RETURNING job.job_id`,
    [job.id, workerId.slice(0, 160)],
  );
  return Boolean(result.rowCount);
}

export async function cancelClaimedAnalysisJob(
  job: MediaIntelligenceJob,
  workerId: string,
  reason: string,
): Promise<boolean> {
  const result = await mediaIntelligenceQuery(
    `UPDATE media_intelligence_jobs SET status = 'cancelled', lease_owner = NULL,
       lease_expires_at = NULL, finished_at = now(), updated_at = now(), last_error = $3
     WHERE job_id = $1 AND status = 'running' AND lease_owner = $2
     RETURNING job_id`,
    [job.id, workerId.slice(0, 160), reason.slice(0, 2_000)],
  );
  return Boolean(result.rowCount);
}

export async function failAnalysisJob(
  job: MediaIntelligenceJob,
  workerId: string,
  error: unknown,
): Promise<boolean> {
  const terminal = job.attempts >= job.maxAttempts;
  const delaySeconds = Math.min(3600, 15 * (2 ** Math.max(0, job.attempts - 1)));
  const result = await mediaIntelligenceQuery(
    `UPDATE media_intelligence_jobs SET status = $2, lease_owner = NULL,
       lease_expires_at = NULL, available_at = now() + ($3::text || ' seconds')::interval,
       last_error = $4, finished_at = CASE WHEN $2 = 'dead-letter' THEN now() ELSE NULL END,
       updated_at = now()
     WHERE job_id = $1 AND status = 'running' AND lease_owner = $5
     RETURNING job_id`,
    [
      job.id,
      terminal ? "dead-letter" : "failed",
      delaySeconds,
      (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
      workerId.slice(0, 160),
    ],
  );
  return Boolean(result.rowCount);
}

export async function retryDeadLetterJobs(limit = 100): Promise<number> {
  const result = await mediaIntelligenceQuery(
    `WITH retry AS (
       SELECT job_id FROM media_intelligence_jobs WHERE status = 'dead-letter'
       ORDER BY updated_at ASC LIMIT $1
     )
     UPDATE media_intelligence_jobs j SET status = 'queued', attempts = 0,
       available_at = now(), finished_at = NULL, last_error = NULL, updated_at = now()
     FROM retry WHERE j.job_id = retry.job_id RETURNING j.job_id`,
    [Math.max(1, Math.min(1_000, Math.trunc(limit)))],
  );
  return result.rowCount ?? 0;
}

export async function dispatchMediaOutbox(limit = 50): Promise<{ published: number; deferred: number; failed: number }> {
  const transport = getAzureMediaAdapters().serviceBus;
  if (!transport) {
    const pending = await mediaIntelligenceQuery<{ total: string }>(
      `SELECT count(*)::text AS total FROM media_intelligence_outbox WHERE status <> 'published'`,
    );
    return { published: 0, deferred: Number(pending.rows[0]?.total ?? 0), failed: 0 };
  }
  const rows = await mediaIntelligenceQuery<{
    event_id: string; topic: string; payload: Record<string, unknown>; attempts: number;
  }>(
    `SELECT event_id, topic, payload, attempts FROM media_intelligence_outbox
     WHERE status IN ('pending','failed') AND available_at <= now()
     ORDER BY created_at ASC LIMIT $1`,
    [Math.max(1, Math.min(500, Math.trunc(limit)))],
  );
  let published = 0;
  let failed = 0;
  for (const row of rows.rows) {
    try {
      await transport.publish({ id: row.event_id, topic: row.topic, payload: row.payload });
      await mediaIntelligenceQuery(
        `UPDATE media_intelligence_outbox SET status = 'published', attempts = attempts + 1,
         published_at = now(), error = NULL WHERE event_id = $1`,
        [row.event_id],
      );
      published += 1;
    } catch (error) {
      await mediaIntelligenceQuery(
        `UPDATE media_intelligence_outbox SET status = 'failed', attempts = attempts + 1,
         available_at = now() + interval '5 minutes', error = $2 WHERE event_id = $1`,
        [row.event_id, (error instanceof Error ? error.message : String(error)).slice(0, 2_000)],
      );
      failed += 1;
    }
  }
  return { published, deferred: 0, failed };
}
