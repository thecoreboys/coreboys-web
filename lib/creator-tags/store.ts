import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mediaIntelligenceQuery, withMediaIntelligenceTransaction } from "@/lib/media-intelligence/schema";
import { cachedPublicData } from "@/lib/server-cache";
import { defaultCreatorDirectory } from "./directory";
import { fetchCreatorAvatarUpdates } from "./avatars";
import { AnnotationInput, Box, CreatorInput, createCreatorTextMatcher, matchCreatorText, type CreatorAnnotation, type CreatorProfile, type CreatorTagPayload } from "./model";

export async function creatorDirectory(): Promise<CreatorProfile[]> {
  const profiles = new Map(defaultCreatorDirectory().map((creator) => [creator.id, creator]));
  const result = await mediaIntelligenceQuery<{ profile: unknown }>("SELECT profile FROM media_creator_directory ORDER BY creator_id LIMIT 1000");
  for (const row of result.rows) {
    const parsed = CreatorInput.safeParse(row.profile);
    if (parsed.success) profiles.set(parsed.data.id, parsed.data);
  }
  return [...profiles.values()];
}

export async function saveCreator(input: unknown, actor: string) {
  const profile = CreatorInput.parse(input);
  await mediaIntelligenceQuery(`INSERT INTO media_creator_directory(creator_id,profile,updated_by) VALUES($1,$2::jsonb,$3)
    ON CONFLICT(creator_id) DO UPDATE SET profile=EXCLUDED.profile,updated_by=EXCLUDED.updated_by,updated_at=now()`, [profile.id, JSON.stringify(profile), actor]);
  return profile;
}

export async function refreshCreatorAvatars(limit = 50) {
  const updates = await fetchCreatorAvatarUpdates(await creatorDirectory(), limit);
  let updated = 0;
  for (const entry of updates) {
    const result = await mediaIntelligenceQuery(`INSERT INTO media_creator_directory(creator_id,profile,updated_by) VALUES($1,$2::jsonb,'cron:profile-avatars')
      ON CONFLICT(creator_id) DO UPDATE SET profile=EXCLUDED.profile,updated_by=EXCLUDED.updated_by,updated_at=now()
      WHERE media_creator_directory.profile=$3::jsonb`, [entry.profile.id, JSON.stringify(entry.profile), JSON.stringify(entry.previous)]);
    updated += result.rowCount ?? 0;
  }
  return { updated, mode: "provider-profile-metadata" };
}

type TagRow = { id: string; asset_key: string; creator_id: string; start_seconds: number; end_seconds: number; box: unknown; evidence_kind: string; evidence: string; status: string; current: boolean };
function annotation(row: TagRow): CreatorAnnotation {
  const parsed = Box.safeParse(row.box);
  return { id: row.id, assetKey: row.asset_key, creatorId: row.creator_id, startSeconds: row.start_seconds, endSeconds: row.end_seconds,
    box: parsed.success ? parsed.data : null, evidenceKind: row.evidence_kind, evidence: row.evidence, status: row.status, current: row.current };
}

const CURRENT_SOURCE = `a.active AND r.is_current AND NOT EXISTS (
  SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)
  AND (n.transcript_id IS NULL OR EXISTS (SELECT 1 FROM media_intelligence_transcript_imports ti
    WHERE ti.import_id=n.transcript_id AND ti.status='approved' AND ti.expires_at>now() AND ti.revision_id=r.revision_id))`;

/** Public reads expose editorially published tags only; candidates stay private. */
export async function publicCreatorTags(assetKey: string, liveStartedAt: string | null = null): Promise<CreatorTagPayload> {
  return cachedPublicData(`creator-tags:v2:${assetKey}:${liveStartedAt ?? "unknown"}`, async () => {
    const [directory, result, asset] = await Promise.all([
      creatorDirectory(),
      mediaIntelligenceQuery<TagRow>(`SELECT n.*,true AS current FROM media_creator_annotations n
        JOIN media_intelligence_assets a ON a.asset_key=n.asset_key
        JOIN media_intelligence_revisions r ON r.revision_id=n.revision_id
        WHERE n.asset_key=$1 AND n.status='published' AND ${CURRENT_SOURCE}
          AND (NOT a.is_live OR a.platform='youtube' OR a.published_at=$2::timestamptz)
        ORDER BY n.start_seconds,n.id LIMIT 500`, [assetKey, liveStartedAt]),
      mediaIntelligenceQuery<{ title: string; description: string | null }>(`SELECT title,description FROM media_intelligence_assets a
        WHERE asset_key=$1 AND active AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)`, [assetKey]),
    ]);
    const creators = directory.filter((creator) => creator.active);
    const allowed = new Set(creators.map((creator) => creator.id));
    const text = [asset.rows[0]?.title, asset.rows[0]?.description].filter(Boolean).join(". ");
    return { creators, tags: result.rows.map(annotation).filter((tag) => allowed.has(tag.creatorId)),
      mentions: matchCreatorText(text, creators).map((creator) => ({ creatorId: creator.id, evidence: text.slice(0, 300), kind: "metadata" })) };
  }, { freshSeconds: 15, staleSeconds: 0, validate: (value): value is CreatorTagPayload => Boolean(value && typeof value === "object" && Array.isArray((value as CreatorTagPayload).tags)) });
}

export async function submitCreatorAnnotation(raw: unknown, actor: string, editId?: string) {
  const input = AnnotationInput.parse(raw);
  const creator = (await creatorDirectory()).find((profile) => profile.id === input.creatorId && profile.active);
  if (!creator) throw new Error("Choose an active creator from the directory.");
  return withMediaIntelligenceTransaction(async (client) => {
    const result = await client.query<{ revision_id: string; duration_seconds: number | null; is_live: boolean; platform: string; published_at: Date | null }>(`SELECT r.revision_id,a.duration_seconds,a.is_live,a.platform,a.published_at
      FROM media_intelligence_assets a JOIN media_intelligence_revisions r ON r.asset_key=a.asset_key AND r.is_current
      WHERE a.asset_key=$1 AND a.active AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key) FOR SHARE OF a,r`, [input.assetKey]);
    const source = result.rows[0];
    if (!source) throw new Error("This source has not been indexed yet, or is no longer available.");
    if (source.is_live && source.platform === "twitch" && (!source.published_at || !input.liveStartedAt || source.published_at.getTime() !== Date.parse(input.liveStartedAt))) throw new Error("The current Twitch broadcast must be indexed before tagging.");
    if (source.duration_seconds && input.endSeconds > source.duration_seconds + 1) throw new Error("Keep the tag within the video duration.");
    if (editId) {
      const target = await client.query("SELECT status FROM media_creator_annotations WHERE id=$1 FOR UPDATE", [editId]);
      if (!target.rows.length || !["draft", "published"].includes(target.rows[0].status)) throw new Error("This tag cannot be edited.");
      await client.query(`UPDATE media_creator_annotations SET asset_key=$2,revision_id=$3,creator_id=$4,start_seconds=$5,end_seconds=$6,
        box=$7::jsonb,evidence_kind=$8,evidence=$9,status='draft',transcript_id=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=$1`,
      [editId, input.assetKey, source.revision_id, input.creatorId, input.startSeconds, input.endSeconds, JSON.stringify(input.box), input.evidenceKind, input.evidence]);
      return { id: editId, status: "draft" };
    }
    const id = randomUUID();
    await client.query(`INSERT INTO media_creator_annotations(id,asset_key,revision_id,creator_id,start_seconds,end_seconds,box,evidence_kind,evidence,submitted_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`, [id, input.assetKey, source.revision_id, input.creatorId, input.startSeconds, input.endSeconds, JSON.stringify(input.box), input.evidenceKind, input.evidence, actor]);
    return { id, status: "draft" };
  });
}

export async function reviewCreatorAnnotation(id: string, action: "publish" | "reject" | "revoke", actor: string) {
  return withMediaIntelligenceTransaction(async (client) => {
    const found = await client.query<TagRow>(`SELECT n.*,(${CURRENT_SOURCE}) AS current FROM media_creator_annotations n
      JOIN media_intelligence_assets a ON a.asset_key=n.asset_key JOIN media_intelligence_revisions r ON r.revision_id=n.revision_id
      WHERE n.id=$1 FOR UPDATE OF n`, [id]);
    const row = found.rows[0];
    if (!row) throw new Error("Tag not found.");
    if (action === "publish" && !row.current) throw new Error("This source or transcript changed. Create a tag for its current revision.");
    if (action === "publish" && row.status !== "draft") throw new Error("Only draft tags can be published.");
    const status = action === "publish" ? "published" : action === "reject" ? "rejected" : "revoked";
    await client.query("UPDATE media_creator_annotations SET status=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$1", [id, status, actor]);
    return { id, status };
  });
}

export async function creatorTagDashboard(search = "") {
  const [creators, annotations, assets] = await Promise.all([
    creatorDirectory(),
    mediaIntelligenceQuery<TagRow>(`SELECT n.*,(${CURRENT_SOURCE}) AS current FROM media_creator_annotations n
      JOIN media_intelligence_assets a ON a.asset_key=n.asset_key JOIN media_intelligence_revisions r ON r.revision_id=n.revision_id
      WHERE n.status IN ('draft','published') ORDER BY (n.status='draft') DESC,n.created_at DESC LIMIT 100`),
    mediaIntelligenceQuery<{ assetKey: string; title: string; isLive: boolean; duration: number | null; publishedAt: Date | null }>(`SELECT asset_key AS "assetKey",title,is_live AS "isLive",duration_seconds AS duration,published_at AS "publishedAt"
      FROM media_intelligence_assets a WHERE active AND (title ILIKE $1 OR asset_key ILIKE $1)
      AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)
      ORDER BY updated_at DESC LIMIT 50`, [`%${search.slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`]),
  ]);
  return { creators, annotations: annotations.rows.map(annotation), assets: assets.rows };
}

/** Scheduled, bounded, text-only matching. A mention is a review candidate, never an on-screen identity. */
export async function scanCreatorMentions(limit = 50) {
  const creators = (await creatorDirectory()).filter((creator) => creator.active);
  const match = createCreatorTextMatcher(creators);
  const directoryHash = createHash("sha256").update(JSON.stringify(creators.map(({ id, name, aliases, active }) => ({ id, name, aliases, active })))).digest("hex");
  const assets = await mediaIntelligenceQuery<{ asset_key: string; revision_id: string; title: string; description: string | null; duration_seconds: number | null }>(`SELECT a.asset_key,r.revision_id,a.title,a.description,a.duration_seconds
    FROM media_intelligence_assets a JOIN media_intelligence_revisions r ON r.asset_key=a.asset_key AND r.is_current
    LEFT JOIN media_creator_scans s ON s.revision_id=r.revision_id
    WHERE a.active AND NOT EXISTS (SELECT 1 FROM media_intelligence_tombstones t WHERE t.asset_key=a.asset_key)
      AND (s.input_hash IS DISTINCT FROM $1 OR s.scanned_at < (SELECT max(ti.reviewed_at) FROM media_intelligence_transcript_imports ti WHERE ti.revision_id=r.revision_id))
    ORDER BY a.is_live DESC,s.scanned_at NULLS FIRST,a.updated_at DESC LIMIT $2`, [directoryHash, Math.min(100, Math.max(1, limit))]);
  let added = 0;
  for (const asset of assets.rows) {
    await withMediaIntelligenceTransaction(async (client) => {
      // Atomic claim + candidates. Concurrent cron retries cannot duplicate results.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`creator-scan:${asset.revision_id}`]);
      const current = await client.query("SELECT 1 FROM media_intelligence_revisions r JOIN media_intelligence_assets a ON a.asset_key=r.asset_key WHERE r.revision_id=$1 AND r.is_current AND a.active", [asset.revision_id]);
      if (!current.rows.length) return;
      const captions = await client.query<{ import_id: string; cues: Array<{ text: string; startSeconds: number; endSeconds: number }> }>(`SELECT import_id,cues FROM media_intelligence_transcript_imports
        WHERE revision_id=$1 AND status='approved' AND expires_at>now() ORDER BY reviewed_at DESC LIMIT 1`, [asset.revision_id]);
      const evidence = [{ text: [asset.title, asset.description].filter(Boolean).join(". "), start: 0, end: Math.min(15, asset.duration_seconds || 15), kind: "metadata", transcriptId: null as string | null },
        ...(captions.rows[0]?.cues ?? []).slice(0, 10000).map((cue) => ({ text: cue.text, start: cue.startSeconds, end: cue.endSeconds, kind: "caption", transcriptId: captions.rows[0]!.import_id }))];
      let perAsset = 0;
      for (const entry of evidence) {
        if (entry.end <= entry.start || entry.end - entry.start > 3600) continue;
        for (const creator of match(entry.text)) {
          if (++perAsset > 100) break;
          const key = createHash("sha256").update(JSON.stringify([asset.revision_id, creator.id, entry.kind, entry.start, entry.end, entry.text, entry.transcriptId])).digest("hex");
          const inserted = await client.query(`INSERT INTO media_creator_annotations(id,asset_key,revision_id,creator_id,start_seconds,end_seconds,evidence_kind,evidence,evidence_key,transcript_id,submitted_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cron:text-mentions') ON CONFLICT(evidence_key) DO NOTHING RETURNING id`,
          [randomUUID(), asset.asset_key, asset.revision_id, creator.id, entry.start, entry.end, entry.kind, entry.text.slice(0, 1000), key, entry.transcriptId]);
          added += inserted.rowCount ?? 0;
        }
        if (perAsset > 100) break;
      }
      await client.query(`INSERT INTO media_creator_scans(revision_id,input_hash) VALUES($1,$2)
        ON CONFLICT(revision_id) DO UPDATE SET input_hash=EXCLUDED.input_hash,scanned_at=now()`, [asset.revision_id, directoryHash]);
    });
  }
  return { scanned: assets.rows.length, candidatesAdded: added, mode: "text-evidence" };
}
