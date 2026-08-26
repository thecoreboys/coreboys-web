import "server-only";
import type { PoolClient } from "pg";
import {
  ensureMediaIntelligenceSchema,
  mediaIntelligenceQuery,
  withMediaIntelligenceTransaction,
} from "./schema";
import type {
  AnalysisClaim,
  AnalysisClaimResult,
  CompletedAnalysis,
  MediaAssetRecord,
  MediaIntelligenceStore,
  MediaRevisionRecord,
  SearchDocument,
  SearchFilters,
} from "./types";

function vectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

async function insertCompletedAnalysis(client: PoolClient, result: CompletedAnalysis, vector: boolean) {
  // Outputs are owned by an immutable analysis run. Upserts make retries
  // idempotent without deleting another analyzer/stage's evidence.
  for (const segment of result.segments) {
    await client.query(
      `INSERT INTO media_intelligence_segments
        (segment_id, revision_id, run_id, stage, sequence, kind, start_seconds, end_seconds, title,
         text_content, search_document, evidence, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       ON CONFLICT (segment_id) DO UPDATE SET
         title = EXCLUDED.title, text_content = EXCLUDED.text_content,
         search_document = EXCLUDED.search_document, evidence = EXCLUDED.evidence,
         metadata = EXCLUDED.metadata`,
      [
        segment.id,
        segment.revisionId,
        segment.ownerRunId,
        segment.stage,
        segment.sequence,
        segment.kind,
        segment.startSeconds,
        segment.endSeconds,
        segment.title,
        segment.text,
        segment.searchDocument,
        segment.evidence,
        JSON.stringify(segment.metadata),
      ],
    );
  }
  for (const tag of result.tags) {
    await client.query(
      `INSERT INTO media_intelligence_tags
        (revision_id, segment_id, run_id, tag, kind, confidence, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [tag.revisionId, tag.segmentId, tag.ownerRunId, tag.tag, tag.kind, tag.confidence, tag.source],
    );
  }
  for (const alias of result.aliases) {
    await client.query(
      `INSERT INTO media_intelligence_aliases
        (asset_key, alias, normalized_alias, kind, weight)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (asset_key, normalized_alias, kind)
       DO UPDATE SET alias = EXCLUDED.alias, weight = EXCLUDED.weight`,
      [alias.assetKey, alias.alias, alias.normalizedAlias, alias.kind, alias.weight],
    );
  }
  for (const embedding of result.embeddings) {
    await client.query(
      `INSERT INTO media_intelligence_embeddings
        (revision_id, segment_id, run_id, provider, model, dimensions, source_hash, embedding, vector_norm)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::real[],$9)
       ON CONFLICT (revision_id, segment_id, provider, model) DO UPDATE SET
         source_hash = EXCLUDED.source_hash, embedding = EXCLUDED.embedding,
         vector_norm = EXCLUDED.vector_norm, dimensions = EXCLUDED.dimensions,
         run_id = EXCLUDED.run_id`,
      [
        embedding.revisionId,
        embedding.segmentId,
        embedding.ownerRunId,
        embedding.provider,
        embedding.model,
        embedding.dimensions,
        embedding.sourceHash,
        embedding.vector,
        embedding.vectorNorm,
      ],
    );
    if (vector && embedding.dimensions === 384) {
      await client.query(
        `UPDATE media_intelligence_embeddings
            SET embedding_vector = $1::vector
          WHERE revision_id = $2 AND segment_id = $3 AND provider = $4 AND model = $5`,
        [
          vectorLiteral(embedding.vector),
          embedding.revisionId,
          embedding.segmentId,
          embedding.provider,
          embedding.model,
        ],
      );
    }
  }
  for (const artifact of result.artifacts) {
    await client.query(
      `INSERT INTO media_intelligence_artifacts
        (artifact_id, run_id, revision_id, kind, provider, uri, content_hash, metadata, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (artifact_id) DO UPDATE SET
         uri = EXCLUDED.uri, metadata = EXCLUDED.metadata, expires_at = EXCLUDED.expires_at`,
      [
        artifact.id, artifact.ownerRunId, artifact.revisionId, artifact.kind,
        artifact.provider, artifact.uri, artifact.contentHash,
        JSON.stringify(artifact.metadata), artifact.expiresAt,
      ],
    );
  }
  await client.query(
    `UPDATE media_intelligence_analysis_runs
        SET status = 'succeeded', raw_result = $2::jsonb, error = NULL, finished_at = now()
      WHERE run_id = $1`,
    [result.claim.id, JSON.stringify(result.rawResult)],
  );
  await client.query(
    `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload)
     VALUES ($1, 'media.analysis.completed', $2, $3::jsonb)
     ON CONFLICT (topic, event_key) DO NOTHING`,
    [
      `analysis:${result.claim.id}`,
      result.claim.id,
      JSON.stringify({
        runId: result.claim.id,
        revisionId: result.claim.revisionId,
        assetKey: result.assetKey,
        stage: result.claim.stage,
      }),
    ],
  );
}

type SearchRow = {
  item: MediaAssetRecord["item"];
  revision_id: string;
  run_id: string;
  stage: SearchDocument["segment"]["stage"];
  segment_id: string;
  sequence: number;
  kind: SearchDocument["segment"]["kind"];
  start_seconds: number | null;
  end_seconds: number | null;
  segment_title: string | null;
  text_content: string;
  search_document: string;
  evidence: string | null;
  segment_metadata: Record<string, unknown>;
  tags: string[] | null;
  aliases: Array<{ value: string; weight: number }> | null;
  embedding: number[] | null;
  asset_key: string;
  source_policy_key: string | null;
  platform: MediaAssetRecord["platform"];
  external_id: string;
  source_url: string | null;
  content_type: MediaAssetRecord["contentType"];
  format: MediaAssetRecord["format"];
  orientation: MediaAssetRecord["orientation"];
  creator_slug: string | null;
  creator_label: string;
  asset_title: string;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  is_live: boolean;
  active: boolean;
};

export class PostgresMediaIntelligenceStore implements MediaIntelligenceStore {
  readonly kind = "postgres" as const;

  async prepareRevision(asset: MediaAssetRecord, revision: MediaRevisionRecord): Promise<void> {
    await withMediaIntelligenceTransaction(async (client) => {
      await client.query(
        `INSERT INTO media_intelligence_assets
          (asset_key, source_policy_key, platform, external_id, source_url, content_type, format, orientation,
           creator_slug, creator_label, title, description, thumbnail_url, duration_seconds,
           published_at, is_live, item, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)
         ON CONFLICT (asset_key) DO UPDATE SET
           source_policy_key = EXCLUDED.source_policy_key,
           source_url = EXCLUDED.source_url, content_type = EXCLUDED.content_type,
           format = EXCLUDED.format, orientation = EXCLUDED.orientation,
           creator_slug = EXCLUDED.creator_slug, creator_label = EXCLUDED.creator_label,
           title = EXCLUDED.title, description = EXCLUDED.description,
           thumbnail_url = EXCLUDED.thumbnail_url, duration_seconds = EXCLUDED.duration_seconds,
           published_at = EXCLUDED.published_at, is_live = EXCLUDED.is_live,
           item = EXCLUDED.item, active = EXCLUDED.active, updated_at = now()`,
        [
          asset.key, asset.sourcePolicyKey, asset.platform, asset.externalId, asset.sourceUrl, asset.contentType,
          asset.format, asset.orientation, asset.creatorSlug, asset.creatorLabel, asset.title,
          asset.description, asset.thumbnailUrl, asset.durationSeconds, asset.publishedAt,
          asset.isLive, JSON.stringify(asset.item), asset.active,
        ],
      );
      const restored = await client.query<{ tombstone_id: string }>(
        `DELETE FROM media_intelligence_tombstones
         WHERE asset_key = $1 AND reason = 'catalog-missing' AND processed_at IS NULL
         RETURNING tombstone_id`,
        [asset.key],
      );
      if (restored.rowCount) {
        await client.query(
          `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload)
           VALUES ($1, 'media.asset.restored', $2, $3::jsonb)
           ON CONFLICT (topic, event_key) DO NOTHING`,
          [`restored:${asset.key}`, asset.key, JSON.stringify({ assetKey: asset.key })],
        );
      }
      await client.query(
        `UPDATE media_intelligence_revisions SET is_current = false
          WHERE asset_key = $1 AND revision_id <> $2 AND is_current`,
        [asset.key, revision.id],
      );
      await client.query(
        `INSERT INTO media_intelligence_revisions
          (revision_id, asset_key, fingerprint, content_hash, analyzer_input_hash, is_current)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (revision_id) DO UPDATE SET is_current = true`,
        [revision.id, revision.assetKey, revision.fingerprint, revision.contentHash, revision.analyzerInputHash],
      );
    });
  }

  async claimAnalysis(claim: AnalysisClaim): Promise<AnalysisClaimResult> {
    await ensureMediaIntelligenceSchema();
    const claimed = await mediaIntelligenceQuery<{ status: string }>(
      `INSERT INTO media_intelligence_analysis_runs
        (run_id, revision_id, analyzer, analyzer_version, input_hash, stage, idempotency_key, policy_version, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'running')
       ON CONFLICT (idempotency_key)
       DO UPDATE SET status = 'running', attempts = media_intelligence_analysis_runs.attempts + 1,
                     error = NULL, started_at = now(), finished_at = NULL
       WHERE media_intelligence_analysis_runs.status = 'failed'
          OR (media_intelligence_analysis_runs.status = 'running'
              AND media_intelligence_analysis_runs.started_at < now() - interval '15 minutes')
       RETURNING status`,
      [
        claim.id, claim.revisionId, claim.analyzer, claim.analyzerVersion,
        claim.inputHash, claim.stage, claim.idempotencyKey, claim.policyVersion,
      ],
    );
    if (claimed.rowCount) return "claimed";
    const existing = await mediaIntelligenceQuery<{ status: string }>(
      `SELECT status FROM media_intelligence_analysis_runs WHERE idempotency_key = $1`,
      [claim.idempotencyKey],
    );
    return existing.rows[0]?.status === "succeeded" ? "complete" : "busy";
  }

  async completeAnalysis(result: CompletedAnalysis): Promise<void> {
    await withMediaIntelligenceTransaction((client, capabilities) =>
      insertCompletedAnalysis(client, result, capabilities.vector),
    );
  }

  async failAnalysis(claim: AnalysisClaim, error: unknown): Promise<void> {
    await mediaIntelligenceQuery(
      `UPDATE media_intelligence_analysis_runs
          SET status = 'failed', error = $2, finished_at = now()
        WHERE run_id = $1`,
      [claim.id, error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000)],
    );
  }

  async reconcileCatalog(assetKeys: string[]): Promise<void> {
    // A seven-day grace period prevents a transient provider outage from
    // hiding an entire channel. Truly removed catalog entries age out safely.
    await withMediaIntelligenceTransaction(async (client) => {
      await client.query(
        `INSERT INTO media_intelligence_tombstones
          (tombstone_id, asset_key, reason, delete_after, metadata)
         SELECT 'catalog:' || asset_key, asset_key,
                'catalog-missing', now() + interval '30 days',
                jsonb_build_object('lastSeenAt', updated_at)
         FROM media_intelligence_assets
         WHERE active AND NOT (asset_key = ANY($1::text[]))
           AND updated_at < now() - interval '7 days'
         ON CONFLICT (asset_key, reason) DO NOTHING`,
        [assetKeys],
      );
      const deactivated = await client.query<{ asset_key: string }>(
        `UPDATE media_intelligence_assets SET active = false, updated_at = now()
         WHERE active AND NOT (asset_key = ANY($1::text[]))
           AND updated_at < now() - interval '7 days'
         RETURNING asset_key`,
        [assetKeys],
      );
      for (const row of deactivated.rows) {
        await client.query(
          `INSERT INTO media_intelligence_outbox (event_id, topic, event_key, payload)
           VALUES ($1, 'media.asset.tombstoned', $2, $3::jsonb)
           ON CONFLICT (topic, event_key) DO NOTHING`,
          [`tombstone:${row.asset_key}`, row.asset_key, JSON.stringify({ assetKey: row.asset_key })],
        );
      }
    });
  }

  async searchDocuments(
    provider: string,
    model: string,
    filters: SearchFilters,
    queryVector?: number[],
  ): Promise<SearchDocument[]> {
    const capabilities = await ensureMediaIntelligenceSchema();
    const useVector = capabilities.vector && queryVector?.length === 384;
    const result = await mediaIntelligenceQuery<SearchRow>(
      `SELECT
         a.item, r.revision_id, s.run_id, s.stage, s.segment_id, s.sequence, s.kind,
         s.start_seconds, s.end_seconds, s.title AS segment_title,
         s.text_content, s.search_document, s.evidence, s.metadata AS segment_metadata,
         COALESCE((SELECT array_agg(t.tag ORDER BY t.confidence DESC)
                     FROM media_intelligence_tags t WHERE t.segment_id = s.segment_id), ARRAY[]::text[]) AS tags,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('value', al.alias, 'weight', al.weight))
                     FROM media_intelligence_aliases al WHERE al.asset_key = a.asset_key), '[]'::jsonb) AS aliases,
         e.embedding,
         a.asset_key, a.source_policy_key, a.platform, a.external_id, a.source_url, a.content_type,
         a.format, a.orientation, a.creator_slug, a.creator_label,
         a.title AS asset_title, a.description, a.thumbnail_url, a.duration_seconds,
         a.published_at::text, a.is_live, a.active
       FROM media_intelligence_assets a
       JOIN media_intelligence_revisions r ON r.asset_key = a.asset_key AND r.is_current
       JOIN media_intelligence_segments s ON s.revision_id = r.revision_id
       JOIN media_intelligence_analysis_runs ar ON ar.run_id = s.run_id AND ar.status = 'succeeded'
       LEFT JOIN media_intelligence_source_policies policy
         ON policy.source_key = a.source_policy_key
       LEFT JOIN media_intelligence_embeddings e
         ON e.segment_id = s.segment_id AND e.provider = $1 AND e.model = $2
       WHERE a.active
         AND NOT EXISTS (
           SELECT 1 FROM media_intelligence_tombstones tomb
           WHERE tomb.asset_key = a.asset_key AND tomb.processed_at IS NULL
         )
         AND COALESCE(policy.analysis_mode, 'metadata-only') <> 'skip'
         AND COALESCE(policy.rights_status, 'public-metadata') <> 'restricted'
         AND (
           s.stage = 'metadata'
           OR (
             policy.analysis_mode = 'deep'
             AND policy.media_access_allowed
             AND policy.rights_status IN ('owned','licensed')
           )
         )
         AND ($3::text[] IS NULL OR a.platform = ANY($3::text[]))
         AND ($4::text[] IS NULL OR a.format = ANY($4::text[]))
         AND (
           $5::text IS NULL
           OR ($5 = 'house' AND a.creator_slug IS NULL)
           OR ($5 <> 'house' AND a.creator_slug = $5)
         )
         AND (NOT $6::boolean OR a.is_live)
         AND ($7::text[] IS NULL OR a.content_type = ANY($7::text[]))
         AND ($8::timestamptz IS NULL OR a.published_at >= $8::timestamptz)
         AND ($9::timestamptz IS NULL OR a.published_at <= $9::timestamptz)
         AND ($10::integer IS NULL OR a.duration_seconds >= $10::integer)
         AND ($11::integer IS NULL OR a.duration_seconds <= $11::integer)
       ORDER BY ${useVector ? "COALESCE(e.embedding_vector <=> $12::vector, 2) ASC," : ""}
                a.is_live DESC, a.published_at DESC NULLS LAST
       LIMIT 20000`,
      [
        provider,
        model,
        filters.platforms?.length ? filters.platforms : null,
        filters.formats?.length ? filters.formats : null,
        filters.memberSlug ?? null,
        filters.liveOnly ?? false,
        filters.contentTypes?.length ? filters.contentTypes : null,
        filters.publishedAfter ?? null,
        filters.publishedBefore ?? null,
        filters.minDurationSeconds ?? null,
        filters.maxDurationSeconds ?? null,
        ...(useVector ? [vectorLiteral(queryVector)] : []),
      ],
    );
    return result.rows.map((row) => ({
      asset: {
        key: row.asset_key,
        sourcePolicyKey: row.source_policy_key ?? `${row.platform}:unknown`,
        platform: row.platform,
        externalId: row.external_id,
        sourceUrl: row.source_url,
        contentType: row.content_type,
        format: row.format,
        orientation: row.orientation,
        creatorSlug: row.creator_slug,
        creatorLabel: row.creator_label,
        title: row.asset_title,
        description: row.description,
        thumbnailUrl: row.thumbnail_url,
        durationSeconds: row.duration_seconds,
        publishedAt: row.published_at,
        isLive: row.is_live,
        item: row.item,
        active: row.active,
      },
      revisionId: row.revision_id,
      segment: {
        id: row.segment_id,
        revisionId: row.revision_id,
        ownerRunId: row.run_id,
        stage: row.stage,
        sequence: row.sequence,
        kind: row.kind,
        startSeconds: row.start_seconds,
        endSeconds: row.end_seconds,
        title: row.segment_title,
        text: row.text_content,
        searchDocument: row.search_document,
        evidence: row.evidence,
        metadata: row.segment_metadata,
      },
      tags: row.tags ?? [],
      aliases: row.aliases ?? [],
      embedding: row.embedding?.map(Number) ?? null,
    }));
  }

  async stats(): Promise<{ assets: number; revisions: number; segments: number; embeddings: number }> {
    const result = await mediaIntelligenceQuery<{
      assets: string;
      revisions: string;
      segments: string;
      embeddings: string;
    }>(`SELECT
      (SELECT count(*) FROM media_intelligence_assets WHERE active) AS assets,
      (SELECT count(*) FROM media_intelligence_revisions) AS revisions,
      (SELECT count(*) FROM media_intelligence_segments) AS segments,
      (SELECT count(*) FROM media_intelligence_embeddings) AS embeddings`);
    const row = result.rows[0];
    return {
      assets: Number(row?.assets ?? 0),
      revisions: Number(row?.revisions ?? 0),
      segments: Number(row?.segments ?? 0),
      embeddings: Number(row?.embeddings ?? 0),
    };
  }
}

let singleton: PostgresMediaIntelligenceStore | null = null;

export function getMediaIntelligenceStore(): PostgresMediaIntelligenceStore {
  singleton ??= new PostgresMediaIntelligenceStore();
  return singleton;
}
