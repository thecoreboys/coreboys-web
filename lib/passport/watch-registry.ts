import "server-only";

import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { redisGetJson, redisSetJson } from "@/lib/redis";
import { passportPlaybackProviderIds } from "@/lib/passport/policy";
import type { WatchCatalog, WatchItem } from "@/lib/watch/types";

type RegisteredWatchAsset={
  playbackRef:string;
  platform:string;
  aliases:string[];
  channelSlug:string;
  kind:string;
  shortForm:boolean;
  durationSeconds:number|null;
  sourceUrl:string|null;
};

function registerable(item:WatchItem):boolean{
  return item.kind!=="post"&&item.format!=="photo"&&item.embeddable!==false;
}

function registeredAsset(item:WatchItem):RegisteredWatchAsset|null{
  if(!registerable(item))return null;
  const providerIds=passportPlaybackProviderIds(item.id,item.platform);
  const providerId=providerIds.find(id=>id!==item.id)??providerIds[0]??item.id;
  const playbackRef=`${item.platform}:${providerId}`;
  const liveLogin=item.kind==="live"&&item.platform==="twitch"?item.live?.login?.trim().toLowerCase():null;
  const aliases=[
    item.id,playbackRef,`${item.platform}:${item.id}`,item.sourceUrl,
    ...providerIds,...providerIds.map(id=>`${item.platform}:${id}`),
    liveLogin,liveLogin?`twitch:${liveLogin}`:null,liveLogin?`twitch:stream:${liveLogin}`:null,
    liveLogin?`live-${liveLogin}`:null,
  ].filter((value):value is string=>Boolean(value&&value.length<=500));
  return{
    playbackRef,platform:item.platform,aliases:[...new Set(aliases)],
    channelSlug:item.memberSlug??"core",kind:item.kind,
    shortForm:item.format==="short",
    durationSeconds:item.durationSeconds&&item.durationSeconds>0?Math.floor(item.durationSeconds):null,
    sourceUrl:item.sourceUrl??null,
  };
}

const REGISTRY_RENEWAL_MS = 24 * 60 * 60 * 1_000;
// Live event nominations require a catalog observation within 15 minutes.
const LIVE_REGISTRY_RENEWAL_MS = 5 * 60 * 1_000;
const REGISTRY_BATCH_SIZE = 1_000;

const REGISTER_ASSETS_SQL = `WITH assets AS (
      SELECT value AS asset FROM jsonb_array_elements($1::jsonb)
    ), normalized AS (
      SELECT asset->>'playbackRef' AS playback_ref,
             asset->>'platform' AS platform,
             ARRAY(SELECT jsonb_array_elements_text(asset->'aliases')) AS aliases,
             asset->>'channelSlug' AS channel_slug,
             asset->>'kind' AS kind,
             COALESCE((asset->>'shortForm')::boolean,false) AS short_form,
             NULLIF(asset->>'durationSeconds','')::integer AS duration_seconds,
             NULLIF(asset->>'sourceUrl','') AS source_url
        FROM assets
    )
    INSERT INTO passport_watch_assets
      (playback_ref,platform,aliases,channel_slug,kind,short_form,duration_seconds,source_url,last_seen_at)
    SELECT playback_ref,platform,aliases,channel_slug,kind,short_form,duration_seconds,source_url,now()
      FROM normalized
    ON CONFLICT(playback_ref) DO UPDATE SET
      platform=EXCLUDED.platform,aliases=EXCLUDED.aliases,channel_slug=EXCLUDED.channel_slug,
      kind=EXCLUDED.kind,short_form=EXCLUDED.short_form,duration_seconds=EXCLUDED.duration_seconds,source_url=EXCLUDED.source_url,
      last_seen_at=now(),updated_at=now()
    WHERE (passport_watch_assets.platform,passport_watch_assets.aliases,passport_watch_assets.channel_slug,
           passport_watch_assets.kind,passport_watch_assets.short_form,passport_watch_assets.duration_seconds,passport_watch_assets.source_url)
      IS DISTINCT FROM (EXCLUDED.platform,EXCLUDED.aliases,EXCLUDED.channel_slug,
           EXCLUDED.kind,EXCLUDED.short_form,EXCLUDED.duration_seconds,EXCLUDED.source_url)
       OR passport_watch_assets.last_seen_at < now()-CASE WHEN EXCLUDED.kind='live' THEN interval '5 minutes' ELSE interval '1 day' END`;

type RegistryDependencies = {
  execute: (sql: string, values: ReadonlyArray<unknown>) => Promise<{ rowCount: number | null }>;
  readMarker?: (key: string) => Promise<unknown>;
  writeMarker?: (key: string, value: unknown, expirySeconds: number) => Promise<unknown>;
  now?: () => number;
  namespace?: string;
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function renewalInterval(asset: RegisteredWatchAsset): number {
  return asset.kind === "live" ? LIVE_REGISTRY_RENEWAL_MS : REGISTRY_RENEWAL_MS;
}

type RegistryMarker = { fingerprint: string; archiveConfirmedAt: number; liveConfirmedAt: number };

/**
 * Keep every current asset available, while registering only changed metadata
 * on ordinary catalog refreshes. Success markers are published only after all
 * writes finish; a failed batch stays eligible for the next attempt.
 */
export function createPassportWatchCatalogRegistrar(dependencies: RegistryDependencies) {
  const now = dependencies.now ?? Date.now;
  const persisted = new Map<string, { fingerprint: string; confirmedAt: number }>();
  let queue: Promise<unknown> = Promise.resolve();

  async function register(catalog: WatchCatalog): Promise<number> {
    const byRef = new Map<string, RegisteredWatchAsset>();
    for (const item of catalog.all) {
      const asset = registeredAsset(item);
      if (!asset) continue;
      const previous = byRef.get(asset.playbackRef);
      if (previous) asset.aliases = [...new Set([...previous.aliases, ...asset.aliases])].sort();
      byRef.set(asset.playbackRef, asset);
    }
    const assets = [...byRef.values()];
    if (!assets.length) return 0;
    const fingerprints = new Map(assets.map((asset) => [asset.playbackRef, fingerprint({ ...asset, aliases: [...asset.aliases].sort() })]));
    const timestamp = now();
    const changed = assets.filter((asset) => {
      const previous = persisted.get(asset.playbackRef);
      return !previous || previous.fingerprint !== fingerprints.get(asset.playbackRef)
        || timestamp - previous.confirmedAt >= renewalInterval(asset) || timestamp < previous.confirmedAt;
    });
    if (!changed.length) return 0;

    // Acknowledge only the latest complete catalog. Keeping older content-addressed
    // markers could skip a metadata change that reverts to an earlier catalog.
    const key = `passport-watch-registry:v3:${dependencies.namespace ?? "default"}`;
    const catalogFingerprint = fingerprint([...fingerprints].sort(([left], [right]) => left.localeCompare(right)));
    const marker = await dependencies.readMarker?.(key).catch(() => null);
    const acknowledgment = marker as Partial<RegistryMarker> | null | undefined;
    if (acknowledgment?.fingerprint === catalogFingerprint && assets.every((asset) => {
      const confirmedAt = asset.kind === "live" ? acknowledgment.liveConfirmedAt : acknowledgment.archiveConfirmedAt;
      return typeof confirmedAt === "number" && timestamp >= confirmedAt && timestamp - confirmedAt < renewalInterval(asset);
    })) {
      for (const asset of assets) persisted.set(asset.playbackRef, {
        fingerprint: fingerprints.get(asset.playbackRef)!,
        confirmedAt: (asset.kind === "live" ? acknowledgment.liveConfirmedAt : acknowledgment.archiveConfirmedAt)!,
      });
      for (const ref of persisted.keys()) if (!byRef.has(ref)) persisted.delete(ref);
      return 0;
    }

    let count = 0;
    for (let offset = 0; offset < changed.length; offset += REGISTRY_BATCH_SIZE) {
      const batch = changed.slice(offset, offset + REGISTRY_BATCH_SIZE);
      const result = await dependencies.execute(REGISTER_ASSETS_SQL, [JSON.stringify(batch)]);
      count += result.rowCount ?? 0;
      for (const asset of batch) persisted.set(asset.playbackRef, { fingerprint: fingerprints.get(asset.playbackRef)!, confirmedAt: timestamp });
    }
    for (const ref of persisted.keys()) if (!byRef.has(ref)) persisted.delete(ref);
    // Keep separate live/archive renewal clocks. Adding an item cannot prolong
    // older registrations, and a live heartbeat need not resend the archive.
    const completed: RegistryMarker = { fingerprint: catalogFingerprint, archiveConfirmedAt: timestamp, liveConfirmedAt: timestamp };
    let expiresAt = timestamp + REGISTRY_RENEWAL_MS;
    for (const asset of assets) {
      const confirmedAt = persisted.get(asset.playbackRef)!.confirmedAt;
      const field = asset.kind === "live" ? "liveConfirmedAt" : "archiveConfirmedAt";
      completed[field] = Math.min(completed[field], confirmedAt);
      expiresAt = Math.min(expiresAt, confirmedAt + renewalInterval(asset));
    }
    await dependencies.writeMarker?.(key, completed, Math.max(1, Math.ceil((expiresAt - timestamp) / 1_000))).catch(() => undefined);
    return count;
  }

  return (catalog: WatchCatalog): Promise<number> => {
    // One process may receive overlapping refreshes. Serialize registration so
    // older snapshots cannot overwrite newer metadata, even after an error.
    const task = queue.then(() => register(catalog));
    queue = task.catch(() => undefined);
    return task;
  };
}

const registerCatalog = createPassportWatchCatalogRegistrar({
  execute: query,
  readMarker: redisGetJson,
  writeMarker: redisSetJson,
  namespace: createHash("sha256").update(process.env.DATABASE_URL ?? "unconfigured").digest("hex").slice(0, 20),
});

/** Persist the complete server-normalized allowlist before rendering succeeds. */
export function registerPassportWatchCatalog(catalog: WatchCatalog): Promise<number> {
  return registerCatalog(catalog);
}
