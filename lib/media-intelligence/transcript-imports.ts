import "server-only";
import { contentFingerprint } from "./fingerprint";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "./schema";
import { insertCompletedAnalysis } from "./postgres-store";
import { parseTranscript, transcriptAnalysis, transcriptWindows, type TranscriptCue } from "./transcript";

export async function listTranscriptImports() {
  const result = await mediaIntelligenceQuery(`SELECT ti.import_id AS id, ti.asset_key AS "assetKey",
    a.title, ti.language, ti.status, ti.created_at AS "createdAt", ti.expires_at AS "expiresAt",
    ti.rights_reference AS "rightsReference", jsonb_array_length(ti.cues) AS "cueCount",
    ti.cues->0 AS "firstCue", ti.revision_id = r.revision_id AS "currentRevision"
    FROM media_intelligence_transcript_imports ti
    JOIN media_intelligence_assets a ON a.asset_key = ti.asset_key
    LEFT JOIN media_intelligence_revisions r ON r.asset_key = ti.asset_key AND r.is_current
    ORDER BY ti.created_at DESC LIMIT 50`);
  return result.rows;
}

export async function transcriptImportEvidence(id: string) {
  const result = await mediaIntelligenceQuery("SELECT cues FROM media_intelligence_transcript_imports WHERE import_id=$1", [id]);
  return result.rows[0]?.cues ?? null;
}

export async function submitTranscriptImport(input: {
  assetKey: string; source: string; language: string; rightsReference: string; actor: string; expectedRevisionId?: string;
}) {
  return withMediaIntelligenceTransaction(async (client) => {
    const result = await client.query<{ revision_id: string; duration_seconds: number | null; title: string }>(
      `SELECT r.revision_id, a.duration_seconds, a.title FROM media_intelligence_assets a
       JOIN media_intelligence_revisions r ON r.asset_key = a.asset_key AND r.is_current
       LEFT JOIN media_intelligence_source_policies p ON p.source_key = a.source_policy_key
       WHERE a.asset_key = $1 AND a.active AND NOT a.is_live
         AND ($2::text IS NULL OR r.revision_id = $2)
         AND a.content_type NOT IN ('photo','post')
         AND COALESCE(p.rights_status,'public-metadata') <> 'restricted'
         AND COALESCE(p.analysis_mode,'metadata-only') <> 'skip'
         AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key = a.asset_key)
       FOR UPDATE OF a`, [input.assetKey, input.expectedRevisionId ?? null]);
    const asset = result.rows[0];
    if (!asset) throw new Error("Choose an active, indexed replay or video. Restricted, removed and live sources cannot receive transcripts.");
    const cues = parseTranscript(input.source, asset.duration_seconds);
    const windows = transcriptWindows(cues);
    if (windows.length > 500) throw new Error("This import exceeds 500 searchable windows. Supply a shorter reviewed transcript.");
    const hash = contentFingerprint(cues);
    const id = contentFingerprint({ revisionId: asset.revision_id, hash, language: input.language });
    await client.query(`INSERT INTO media_intelligence_transcript_imports
      (import_id, asset_key, revision_id, content_hash, language, cues, rights_reference, submitted_by, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,now() + interval '90 days')
      ON CONFLICT (revision_id, content_hash, language) DO NOTHING`,
      [id, input.assetKey, asset.revision_id, hash, input.language, JSON.stringify(cues), input.rightsReference, input.actor]);
    return { id, title: asset.title, cueCount: cues.length, windows: windows.length, preview: windows.slice(0, 5), publication: "review-required" };
  });
}

export async function reviewTranscriptImport(id: string, action: "approve" | "reject" | "revoke", actor: string) {
  return withMediaIntelligenceTransaction(async (client, capabilities) => {
    // Same lock order as ingestion: asset, then its revision/import rows.
    const lookup = await client.query<{ asset_key: string }>("SELECT asset_key FROM media_intelligence_transcript_imports WHERE import_id=$1", [id]);
    if (!lookup.rows[0]) throw new Error("Transcript import not found.");
    await client.query("SELECT asset_key FROM media_intelligence_assets WHERE asset_key=$1 FOR UPDATE", [lookup.rows[0].asset_key]);
    const result = await client.query<{ asset_key: string; revision_id: string; language: string; cues: TranscriptCue[];
      title: string; active: boolean; is_current: boolean; status: string; eligible: boolean; expired: boolean }>(
      `SELECT ti.*, a.title, a.active, r.is_current, ti.expires_at <= now() AS expired,
         (NOT a.is_live AND COALESCE(p.rights_status,'public-metadata') <> 'restricted'
           AND COALESCE(p.analysis_mode,'metadata-only') <> 'skip'
           AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)) AS eligible
       FROM media_intelligence_transcript_imports ti JOIN media_intelligence_assets a ON a.asset_key=ti.asset_key
       JOIN media_intelligence_revisions r ON r.revision_id=ti.revision_id
       LEFT JOIN media_intelligence_source_policies p ON p.source_key=a.source_policy_key
       WHERE ti.import_id=$1 FOR UPDATE OF ti`, [id]);
    const row = result.rows[0]!;
    if (action === "approve") {
      if (!row.active || !row.is_current || !row.eligible || row.expired) throw new Error("This source changed, expired or is no longer eligible. Import and review its current captions.");
      if (row.status === "approved") return { id, status: "approved", unchanged: true };
      if (row.status !== "draft") throw new Error("Only a draft may be approved. Revoked and rejected imports cannot be republished.");
      const analysis = await transcriptAnalysis({ importId: id, revisionId: row.revision_id, assetKey: row.asset_key,
        title: row.title, language: row.language, cues: row.cues });
      const claim = analysis.claim;
      await client.query(`INSERT INTO media_intelligence_analysis_runs
        (run_id, revision_id, analyzer, analyzer_version, input_hash, stage, idempotency_key, policy_version, status)
        VALUES ($1,$2,$3,$4,$5,$6,$1,$7,'running')`,
        [claim.id, claim.revisionId, claim.analyzer, claim.analyzerVersion, claim.inputHash, claim.stage, claim.policyVersion]);
      await insertCompletedAnalysis(client, analysis, capabilities.vector);
      // A replacement never leaves the previous version searchable alongside it.
      await client.query(`UPDATE media_intelligence_transcript_imports SET status='superseded'
        WHERE revision_id=$1 AND language=$2 AND status='approved' AND import_id<>$3`, [row.revision_id, row.language, id]);
      await client.query(`UPDATE media_intelligence_transcript_imports SET status='approved', run_id=$2,
        reviewed_by=$3, reviewed_at=now() WHERE import_id=$1`, [id, claim.id, actor]);
    } else {
      const status = action === "revoke" ? "revoked" : "rejected";
      if (action === "reject" && row.status !== "draft") throw new Error("Only drafts may be rejected. Use revoke to withdraw published evidence.");
      await client.query(`UPDATE media_intelligence_transcript_imports SET status=$2, reviewed_by=$3, reviewed_at=now() WHERE import_id=$1`, [id, status, actor]);
    }
    // Keep an audit event without copying private caption text or rights evidence.
    const eventKey = `${id}:${action}`;
    await client.query(`INSERT INTO media_intelligence_outbox(event_id,topic,event_key,payload)
      VALUES ($1,'media.transcript.reviewed',$1,$2::jsonb) ON CONFLICT (topic,event_key) DO NOTHING`,
      [eventKey, JSON.stringify({ importId: id, action, actor })]);
    return { id, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked" };
  });
}
