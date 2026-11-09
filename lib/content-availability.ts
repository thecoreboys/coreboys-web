import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { revalidateTag } from "next/cache";
import { query, withTransaction } from "@/lib/db";
import { contentIdentityKeys, contentReferencesIncludingQuotes, sanitizeAvailableContent, type ContentIdentityInput, type ContentProvider } from "./content-identity";

export type ContentQueryClient = Pick<PoolClient, "query">;
export type ContentRemovalInput = ContentIdentityInput & {
  provider: ContentProvider;
  reason: "deleted" | "private" | "not_found" | "admin_removed" | "rights_revoked";
  evidence: "provider_webhook" | "provider_lookup" | "admin_action";
  observedAt?: string;
};

/** No provider requests and no per-user state. Fresh DB checks also protect stale shared caches. */
export async function getUnavailableContentKeys(refs: readonly ContentIdentityInput[], client?: ContentQueryClient): Promise<Set<string>> {
  const keys = [...new Set(refs.flatMap(contentReferencesIncludingQuotes).flatMap(contentIdentityKeys))];
  if (!keys.length) return new Set();
  const result = client
    ? await client.query<{ content_key: string }>("SELECT content_key FROM content_tombstones WHERE content_key=ANY($1::text[])", [keys])
    : await query<{ content_key: string }>("SELECT content_key FROM content_tombstones WHERE content_key=ANY($1::text[])", [keys]);
  return new Set(result.rows.map((row) => row.content_key));
}

export async function filterAvailableContent<T extends ContentIdentityInput>(items: readonly T[], client?: ContentQueryClient): Promise<T[]> {
  return sanitizeAvailableContent(items, await getUnavailableContentKeys(items, client));
}

/** Event insertion and provider removal share these locks, ordered to avoid deadlock. */
export async function lockContentReferences(client: ContentQueryClient, refs: readonly ContentIdentityInput[]): Promise<void> {
  const keys = [...new Set(refs.flatMap(contentIdentityKeys))].sort();
  for (const key of keys) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`content-availability:${key}`]);
}

function aliases(keys: readonly string[], provider: ContentProvider) {
  const ids = keys.filter((key) => key.startsWith(`${provider}:id:`)).map((key) => key.slice(`${provider}:id:`.length));
  const canonicalIds = ids.flatMap((id) => {
    if (provider === "twitch") return [`twitch:${id}`, `twitch:${id.replace(/^video:/, "vod-").replace(/^clip:/, "clip-")}`];
    const prefix = { x: "x-", youtube: "yt-", instagram: "ig-", tiktok: "tt-" }[provider];
    return [`${provider}:${id}`, `${provider}:${prefix}${id}`];
  });
  const urls = keys.filter((key) => key.startsWith(`${provider}:url:`)).flatMap((key) => {
    const value = key.slice(`${provider}:url:`.length);
    const base = [value, value.replace("https://www.", "https://")];
    return provider === "instagram" ? base.flatMap((url) => [url, ...["reel", "reels", "tv"].map((type) => url.replace("/p/", `/${type}/`))]) : base;
  });
  return { ids, canonicalIds, urls: [...new Set(urls)] };
}

/** Only authenticated deletion events or explicit object-lookup evidence may call this. */
export async function recordContentRemoval(input: ContentRemovalInput): Promise<{ recorded: true; keys: string[]; eventsRemoved: number }> {
  if (!["deleted", "private", "not_found", "admin_removed", "rights_revoked"].includes(input.reason) || !["provider_webhook", "provider_lookup", "admin_action"].includes(input.evidence)) throw new Error("invalid_content_removal_evidence");
  if ((input.reason === "admin_removed" || input.reason === "rights_revoked") && input.evidence !== "admin_action") throw new Error("invalid_content_removal_evidence");
  const keys = contentIdentityKeys(input);
  if (!keys.length || keys.some((key) => !key.startsWith(`${input.provider}:`))) throw new Error("invalid_content_removal_identity");
  const observedAt = input.observedAt ? new Date(input.observedAt) : new Date();
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 300_000) throw new Error("invalid_content_removal_time");
  const { ids, canonicalIds, urls } = aliases(keys, input.provider);
  const id = createHash("sha256").update(keys.join("\n")).digest("hex");
  const eventsRemoved = await withTransaction(async (client) => {
    await lockContentReferences(client, [input]);
    await client.query(
      `INSERT INTO content_tombstones(content_key,provider,reason,evidence,observed_at)
       SELECT unnest($1::text[]),$2,$3,$4,$5::timestamptz
       ON CONFLICT(content_key) DO NOTHING`, [keys, input.provider, input.reason, input.evidence, observedAt.toISOString()]);
    const removed = await client.query<{ id: string }>(
      `UPDATE social_content_events SET removed_at=COALESCE(removed_at,$4::timestamptz),removal_reason=COALESCE(removal_reason,$5),
         notification_eligible=false,notification_suppressed_reason='provider_removed',
         title='Content unavailable',body=NULL,artwork_url=NULL,platform_payload='{}'::jsonb
       WHERE provider=$1 AND (canonical_id=ANY($2::text[]) OR regexp_replace(regexp_replace(href,'[?#].*$',''),'/+$','')=ANY($3::text[]))
       RETURNING id::text`, [input.provider, canonicalIds, urls, observedAt.toISOString(), input.reason]);
    const eventIds = removed.rows.map((row) => row.id);
    if (eventIds.length) {
      await client.query(`UPDATE social_notification_deliveries SET status='suppressed',last_error='provider_removed',updated_at=now() WHERE event_id=ANY($1::uuid[])`, [eventIds]);
      // Notification copies are not an archive of content withdrawn upstream.
      await client.query(`DELETE FROM fan_inbox_notifications WHERE source_key=ANY($1::text[])`, [eventIds.map((eventId) => `social:${eventId}`)]);
    }
    if (input.provider === "x") {
      await client.query(`UPDATE social_content_events SET platform_payload=platform_payload #- '{notificationPreview,quote}'
        WHERE provider='x' AND substring(platform_payload#>>'{notificationPreview,quote,statusUrl}' from '/status/([0-9]+)')=ANY($1::text[])`, [ids]);
    }
    await client.query(`INSERT INTO content_removal_cleanup(id,reference,content_keys,reason) VALUES($1,$2::jsonb,$3,$4) ON CONFLICT(id) DO NOTHING`,
      [id, JSON.stringify(input), keys, input.reason]);
    return eventIds.length;
  });
  // Public readers additionally filter after shared-cache reads, across every replica.
  for (const tag of ["core-social-feed-v1", "coreboys:x-feed-snapshot"]) {
    try { revalidateTag(tag); } catch { /* Durable filtering remains authoritative outside Next request scope. */ }
  }
  return { recorded: true, keys, eventsRemoved };
}

/** Retry remote search/media cleanup centrally; never run this from a visitor request. */
export async function drainContentRemovalCleanup(limit = 20): Promise<{ completed: number; pending: number }> {
  const jobs = await query<{ id: string; reference: ContentRemovalInput; content_keys: string[]; related_asset_keys: string[] }>(
    `UPDATE content_removal_cleanup SET status='processing',attempts=attempts+1,lease_expires_at=now()+interval '5 minutes'
      WHERE id IN (SELECT id FROM content_removal_cleanup WHERE status<>'completed' AND available_at<=now()
        AND (lease_expires_at IS NULL OR lease_expires_at<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $1)
      RETURNING id,reference,content_keys,related_asset_keys`, [Math.min(100, Math.max(1, Math.trunc(limit)))]);
  let completed = 0;
  for (const job of jobs.rows) {
    try {
      if (job.reference.provider === "x") {
        const { purgeRemovedXFeedSnapshotItems } = await import("@/lib/x-feed-snapshot");
        await purgeRemovedXFeedSnapshotItems();
      }
      const { mediaIntelligenceQuery } = await import("@/lib/media-intelligence/schema");
      const { tombstoneMediaAsset } = await import("@/lib/media-intelligence/retention");
      const { ids, urls } = aliases(job.content_keys, job.reference.provider);
      if (job.reference.provider === "x") {
        const parents = await mediaIntelligenceQuery<{ asset_key: string }>(
          `SELECT asset_key FROM media_intelligence_assets WHERE platform='x' AND
            (item#>>'{x,quote,statusId}'=ANY($1::text[]) OR item#>>'{x,quoteReference,statusId}'=ANY($1::text[]))`, [ids]);
        const relatedKeys = [...new Set([...(job.related_asset_keys ?? []), ...parents.rows.map((row) => row.asset_key)])];
        if (relatedKeys.length) {
          // Persist retry identities before clearing the copied quote that found these parents.
          await query("UPDATE content_removal_cleanup SET related_asset_keys=$2::text[] WHERE id=$1", [job.id, relatedKeys]);
          await mediaIntelligenceQuery(`UPDATE media_intelligence_assets SET item=item #- '{x,quote}' #- '{x,quoteReference}',updated_at=now() WHERE asset_key=ANY($1::text[])`, [relatedKeys]);
          const { getAzureMediaAdapters } = await import("@/lib/media-intelligence/azure");
          const search = getAzureMediaAdapters().aiSearch;
          if (search) await search.deleteDocuments(relatedKeys);
          else {
            const remote = await mediaIntelligenceQuery<{ present: boolean }>("SELECT EXISTS(SELECT 1 FROM media_intelligence_index_generations WHERE status='active' AND provider<>'local-postgres') AS present");
            if (remote.rows[0]?.present) throw new Error("remote_search_cleanup_unavailable");
          }
        }
      }
      const externalIds = ids.flatMap((id) => {
        const prefixes = { x: ["x-"], youtube: ["yt-"], instagram: ["ig-"], tiktok: ["tt-"], twitch: [] }[job.reference.provider];
        return [id, ...prefixes.map((prefix) => `${prefix}${id}`), `${job.reference.provider}:${id}`, id.replace(/^video:/, "vod-").replace(/^clip:/, "clip-")];
      });
      const rawProviderIds = ids.map((id) => id.replace(/^(?:video|clip):/, ""));
      const assets = await mediaIntelligenceQuery<{
        asset_key: string; platform: string; external_id: string; source_url: string | null; item: ContentIdentityInput | null;
      }>(
        `SELECT asset_key,platform,external_id,source_url,item FROM media_intelligence_assets
          WHERE platform IN ($1,'house') AND (external_id=ANY($2::text[])
          OR regexp_replace(regexp_replace(source_url,'[?#].*$',''),'/+$','')=ANY($3::text[])
          OR EXISTS (SELECT 1 FROM unnest($4::text[]) AS candidate(id) WHERE
            strpos(COALESCE(source_url,''),candidate.id)>0 OR strpos(external_id,candidate.id)>0
            OR strpos(COALESCE(item->>'sourceUrl',''),candidate.id)>0
            OR strpos(COALESCE(item->>'url',''),candidate.id)>0))`,
        [job.reference.provider, externalIds, urls, rawProviderIds]);
      // SQL only narrows the candidate scan. Canonical identity intersection is
      // the deletion proof, including editorial UUIDs and house-tour aliases.
      // A provider ID in a tracking query or lookalike URL cannot delete a row.
      const removedKeys = new Set(job.content_keys);
      for (const asset of assets.rows) {
        const item = asset.item ?? {};
        const references = contentIdentityKeys({ ...item, platform: asset.platform,
          providerId: asset.external_id, sourceUrl: asset.source_url ?? item.sourceUrl });
        if (!references.some((key) => removedKeys.has(key))) continue;
        await tombstoneMediaAsset({ assetKey: asset.asset_key, reason: "provider-deleted", metadata: { source: "content_tombstones", removalReason: job.reference.reason } });
      }
      await query("UPDATE content_removal_cleanup SET status='completed',completed_at=now(),lease_expires_at=NULL WHERE id=$1", [job.id]);
      completed += 1;
    } catch {
      await query("UPDATE content_removal_cleanup SET status='pending',lease_expires_at=NULL,available_at=now()+interval '5 minutes' WHERE id=$1", [job.id]);
    }
  }
  return { completed, pending: jobs.rows.length - completed };
}
