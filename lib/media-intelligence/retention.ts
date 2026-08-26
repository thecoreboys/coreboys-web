import "server-only";
import { getAzureMediaAdapters } from "./azure";
import { contentFingerprint } from "./fingerprint";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "./schema";

export type MediaTombstoneReason = "provider-deleted" | "rights-revoked" | "admin-removed" | "duplicate";

export async function tombstoneMediaAsset(input: {
  assetKey: string;
  reason: MediaTombstoneReason;
  deleteAfterDays?: number;
  metadata?: Record<string, unknown>;
}): Promise<{ found: boolean; tombstoneId: string; remoteDeleted: boolean }> {
  const deleteAfterDays = Math.max(0, Math.min(365, Math.trunc(input.deleteAfterDays ?? 0)));
  const tombstoneId = contentFingerprint({ assetKey: input.assetKey, reason: input.reason });
  const found = await withMediaIntelligenceTransaction(async (client) => {
    const asset = await client.query(
      `UPDATE media_intelligence_assets SET active = false, updated_at = now()
       WHERE asset_key = $1 RETURNING asset_key`,
      [input.assetKey],
    );
    if (!asset.rowCount) return false;
    await client.query(
      `UPDATE media_intelligence_jobs SET status = 'cancelled', finished_at = now(),
         lease_owner = NULL, lease_expires_at = NULL, updated_at = now(), last_error = $2
       WHERE asset_key = $1 AND status IN ('queued','failed','running')`,
      [input.assetKey, `asset_${input.reason}`],
    );
    await client.query(
      `INSERT INTO media_intelligence_tombstones
        (tombstone_id, asset_key, reason, delete_after, metadata)
       VALUES ($1,$2,$3,now() + ($4::text || ' days')::interval,$5::jsonb)
       ON CONFLICT (asset_key, reason) DO UPDATE SET
         delete_after = LEAST(media_intelligence_tombstones.delete_after, EXCLUDED.delete_after),
         metadata = media_intelligence_tombstones.metadata || EXCLUDED.metadata,
         processed_at = NULL`,
      [tombstoneId, input.assetKey, input.reason, deleteAfterDays, JSON.stringify(input.metadata ?? {})],
    );
    await client.query(
      `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload)
       VALUES ($1, 'media.asset.tombstoned', $2, $3::jsonb)
       ON CONFLICT (topic, event_key) DO NOTHING`,
      [
        `tombstoned:${tombstoneId}`,
        tombstoneId,
        JSON.stringify({ assetKey: input.assetKey, tombstoneId, reason: input.reason }),
      ],
    );
    return true;
  });
  let remoteDeleted = false;
  if (found) {
    const search = getAzureMediaAdapters().aiSearch;
    if (search) {
      try {
        await search.deleteDocuments([input.assetKey]);
        remoteDeleted = true;
      } catch {
        // The durable tombstone remains authoritative; scheduled retention
        // retries remote deletion before physically purging the asset.
      }
    }
  }
  return { found, tombstoneId, remoteDeleted };
}

export async function runMediaIntelligenceRetention(limit = 250) {
  const bounded = Math.max(1, Math.min(2_000, Math.trunc(limit)));
  const expired = await mediaIntelligenceQuery<{ artifact_id: string; uri: string | null }>(
    `SELECT artifact_id, uri FROM media_intelligence_artifacts
     WHERE expires_at IS NOT NULL AND expires_at <= now()
     ORDER BY expires_at ASC LIMIT $1`,
    [bounded],
  );
  let artifactsDeleted = 0;
  let artifactsFailed = 0;
  for (const artifact of expired.rows) {
    try {
      const blob = getAzureMediaAdapters().blob;
      if (artifact.uri && !blob) {
        artifactsFailed += 1;
        continue;
      }
      if (artifact.uri) await blob!.delete(artifact.uri);
      await mediaIntelligenceQuery(`DELETE FROM media_intelligence_artifacts WHERE artifact_id = $1`, [artifact.artifact_id]);
      artifactsDeleted += 1;
    } catch {
      artifactsFailed += 1;
    }
  }
  const tombstones = await mediaIntelligenceQuery<{ tombstone_id: string; asset_key: string }>(
    `SELECT tombstone_id, asset_key FROM media_intelligence_tombstones
     WHERE processed_at IS NULL AND delete_after <= now()
     ORDER BY delete_after ASC LIMIT $1`,
    [bounded],
  );
  let tombstonesProcessed = 0;
  let tombstonesFailed = 0;
  for (const tombstone of tombstones.rows) {
    try {
      const artifacts = await mediaIntelligenceQuery<{ uri: string | null }>(
        `SELECT artifact.uri FROM media_intelligence_artifacts artifact
         JOIN media_intelligence_revisions revision ON revision.revision_id = artifact.revision_id
         WHERE revision.asset_key = $1`,
        [tombstone.asset_key],
      );
      const blob = getAzureMediaAdapters().blob;
      if (artifacts.rows.some((artifact) => Boolean(artifact.uri)) && !blob) {
        throw new Error("artifact_store_unavailable");
      }
      if (blob) {
        for (const artifact of artifacts.rows) {
          if (artifact.uri) await blob.delete(artifact.uri);
        }
      }
      const remoteGeneration = await mediaIntelligenceQuery<{ present: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM media_intelligence_index_generations
           WHERE status = 'active' AND provider <> 'local-postgres'
         ) AS present`,
      );
      const search = getAzureMediaAdapters().aiSearch;
      if (remoteGeneration.rows[0]?.present && !search) throw new Error("search_index_adapter_unavailable");
      await search?.deleteDocuments([tombstone.asset_key]);
      await withMediaIntelligenceTransaction(async (client) => {
        // Deleting the asset cascades through revisions, run outputs, jobs and
        // artifacts. The detached tombstone remains as the deletion audit.
        await client.query(`DELETE FROM media_intelligence_assets WHERE asset_key = $1`, [tombstone.asset_key]);
        await client.query(
          `UPDATE media_intelligence_tombstones SET processed_at = now(),
           metadata = metadata || jsonb_build_object('purgedAt', now())
           WHERE tombstone_id = $1`,
          [tombstone.tombstone_id],
        );
        await client.query(
          `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload, status)
           VALUES ($1, 'media.asset.purged', $2, $3::jsonb, 'pending')
           ON CONFLICT (topic, event_key) DO NOTHING`,
          [
            `purged:${tombstone.tombstone_id}`,
            tombstone.tombstone_id,
            JSON.stringify({ assetKey: tombstone.asset_key, tombstoneId: tombstone.tombstone_id }),
          ],
        );
      });
      tombstonesProcessed += 1;
    } catch {
      tombstonesFailed += 1;
    }
  }
  const jobs = await mediaIntelligenceQuery(
    `DELETE FROM media_intelligence_jobs
     WHERE status IN ('succeeded','cancelled') AND finished_at < now() - interval '90 days'
     RETURNING job_id`,
  );
  return {
    artifactsDeleted,
    artifactsFailed,
    tombstonesProcessed,
    tombstonesFailed,
    jobsPruned: jobs.rowCount ?? 0,
  };
}
