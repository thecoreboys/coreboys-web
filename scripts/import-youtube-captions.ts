/** Bounded caption-only acquisition from the operator-authorized official CORE channel. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { GROUP } from "../lib/group";
import { getMediaIntelligencePool } from "../lib/media-intelligence/schema";
import { submitTranscriptImport } from "../lib/media-intelligence/transcript-imports";
import { youtubeCaptionsToVtt } from "../lib/media-intelligence/youtube-captions";

const run = promisify(execFile);
const apply = process.argv.includes("--apply");
const grant = process.env.CORE_CAPTION_PERMISSION_REFERENCE?.trim();
const channelId = GROUP.socials.youtube.channelId;
const log = (data: Record<string, unknown>) => console.log(JSON.stringify(data));

async function main() {
  if (!channelId || !/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new Error("invalid_channel_configuration");
  if (apply && (process.env.CORE_CAPTION_PROCESSING_AUTHORIZED !== "true" || !grant || grant.length < 8)) {
    throw new Error("explicit_core_caption_permission_required");
  }
  const pool = getMediaIntelligencePool();
  const client = pool;
  try {
    const rows = (await client.query<{ asset_key: string; revision_id: string; external_id: string }>(`
      SELECT a.asset_key, r.revision_id, a.external_id
      FROM media_intelligence_assets a
      JOIN media_intelligence_revisions r ON r.asset_key=a.asset_key AND r.is_current
      LEFT JOIN media_intelligence_source_policies p ON p.source_key=a.source_policy_key
      LEFT JOIN media_intelligence_caption_acquisition c ON c.asset_key=a.asset_key
      WHERE a.active AND a.platform='youtube' AND NOT a.is_live
        AND a.creator_slug IS NULL AND a.item->>'accountLabel'='CORE'
        AND a.source_policy_key='youtube:core' AND NOT (a.item ? 'programming')
        AND a.content_type NOT IN ('photo','post')
        AND COALESCE(p.rights_status,'public-metadata') <> 'restricted'
        AND COALESCE(p.analysis_mode,'metadata-only') <> 'skip'
        AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)
        AND NOT EXISTS (SELECT 1 FROM media_intelligence_transcript_imports ti WHERE ti.asset_key=a.asset_key)
        AND (c.asset_key IS NULL OR (c.status<>'imported' AND c.retry_after <= now()
          AND (c.revision_id<>r.revision_id OR c.attempts<3)))
      ORDER BY a.published_at DESC NULLS LAST LIMIT 2
    `)).rows;
    log({ status: apply ? "acquiring" : "dry-run", candidates: rows.map((row) => row.asset_key), maxItems: 2, paidCalls: 0 });
    if (!apply) return;
    for (const row of rows) {
      const videoId = row.external_id.replace(/^yt-/, "");
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
      const claim = await client.query(`INSERT INTO media_intelligence_caption_acquisition(asset_key,revision_id,status)
        VALUES ($1,$2,'running') ON CONFLICT(asset_key) DO UPDATE SET
        attempts=CASE WHEN media_intelligence_caption_acquisition.revision_id=EXCLUDED.revision_id
          THEN media_intelligence_caption_acquisition.attempts+1 ELSE 1 END,
        revision_id=EXCLUDED.revision_id,status='running',retry_after=now()+interval '1 day',error_code=NULL,updated_at=now()
        WHERE media_intelligence_caption_acquisition.status<>'imported'
          AND media_intelligence_caption_acquisition.retry_after <= now()
          AND (media_intelligence_caption_acquisition.revision_id<>EXCLUDED.revision_id
            OR media_intelligence_caption_acquisition.attempts<3)
        RETURNING asset_key`,
      [row.asset_key, row.revision_id]);
      if (!claim.rowCount) { log({ assetKey: row.asset_key, status: "already-claimed" }); continue; }
      const root = resolve(tmpdir());
      const folder = await mkdtemp(join(root, "core-captions-"));
      let stage = "fetch";
      try {
        const { stdout } = await run(process.env.CORE_CAPTION_PYTHON_BIN || "python", [
          resolve("scripts/fetch-youtube-captions.py"), "--video-id", videoId,
          "--channel-id", channelId, "--output-dir", folder,
        ], { timeout: 120_000, maxBuffer: 32_000, windowsHide: true });
        stage = "validate";
        const result = JSON.parse(stdout.trim()) as { status: string; filename?: string; kind?: string; channelId?: string; videoId?: string };
        if (result.status === "unavailable") {
          await client.query("UPDATE media_intelligence_caption_acquisition SET status='unavailable',error_code='no_original_english_captions',updated_at=now() WHERE asset_key=$1", [row.asset_key]);
          log({ assetKey: row.asset_key, status: "unavailable" });
          continue;
        }
        if (result.status !== "downloaded" || result.channelId !== channelId || result.videoId !== videoId
          || ![`${videoId}.en.json3`, `${videoId}.en-orig.json3`].includes(result.filename ?? "")) throw new Error("invalid_worker_result");
        const artifact = join(folder, result.filename!);
        if ((await stat(artifact)).size > 4_000_000) throw new Error("caption_artifact_too_large");
        stage = "normalize";
        const source = youtubeCaptionsToVtt(await readFile(artifact, "utf8"));
        // If the catalog changed during the fetch, wait for a fresh acquisition.
        stage = "revision";
        const current = await client.query("SELECT revision_id FROM media_intelligence_revisions WHERE asset_key=$1 AND is_current", [row.asset_key]);
        if (current.rows[0]?.revision_id !== row.revision_id) throw new Error("source_changed_during_fetch");
        stage = "import";
        const imported = await submitTranscriptImport({ assetKey: row.asset_key, expectedRevisionId: row.revision_id, source, language: "en",
          rightsReference: `${grant} | Official channel ${channelId}; ${result.kind} English captions.`, actor: "system:authorized-core-caption-acquisition" });
        stage = "complete";
        await client.query("UPDATE media_intelligence_caption_acquisition SET status='imported',updated_at=now() WHERE asset_key=$1", [row.asset_key]);
        log({ assetKey: row.asset_key, status: "review-required", importId: imported.id, cues: imported.cueCount, windows: imported.windows, paidCalls: 0 });
      } catch (error) {
        // Do not emit provider stderr, raw database errors, or caption content.
        let code = `caption_${stage}_failed`;
        if (stage === "fetch" && error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string") {
          try {
            const provider = JSON.parse(error.stdout.trim());
            if (["provider_verification_required", "provider_rate_limited", "provider_access_denied", "provider_timeout"].includes(provider.code)) code = provider.code;
          } catch { /* Keep the bounded stage code. */ }
        }
        await client.query("UPDATE media_intelligence_caption_acquisition SET status='failed',error_code=$2,updated_at=now() WHERE asset_key=$1", [row.asset_key, code]);
        log({ assetKey: row.asset_key, status: "failed", code, retryAfterHours: 24 });
        process.exitCode = 1;
      } finally {
        // Delete only the temporary folder just created by this worker.
        if (dirname(resolve(folder)) !== root || !basename(folder).startsWith("core-captions-")) throw new Error("unsafe_temp_cleanup");
        await rm(folder, { recursive: true, force: true });
      }
    }
  } finally {
    await pool.end();
  }
}
void main().catch(() => { log({ status: "failed", code: "caption_worker_unavailable" }); process.exitCode = 1; });
