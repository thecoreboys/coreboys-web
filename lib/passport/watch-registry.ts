import "server-only";

import { createHash } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
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

type RegistryExecute = (sql: string, values: ReadonlyArray<unknown>) => Promise<{
  rowCount: number | null;
  rows?: ReadonlyArray<Record<string, unknown>>;
}>;
type RegistryDependencies = {
  // All instances must share this transaction lock. The acknowledgment and
  // every asset batch commit together, or neither is visible to another reader.
  transaction: (run: (execute: RegistryExecute) => Promise<number>) => Promise<number>;
  now?: () => number;
};

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function renewalInterval(asset: RegisteredWatchAsset): number {
  return asset.kind === "live" ? LIVE_REGISTRY_RENEWAL_MS : REGISTRY_RENEWAL_MS;
}

type RegistryMarker = { fingerprint: string; archiveConfirmedAt: number; liveConfirmedAt: number };

const REGISTRY_STATE_SCHEMA = `CREATE TABLE IF NOT EXISTS passport_watch_registry_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  fingerprint text NOT NULL,
  archive_confirmed_at bigint NOT NULL,
  live_confirmed_at bigint NOT NULL
)`;
let schemaReady: Promise<unknown> | null = null;

function ensureRegistryState(): Promise<unknown> {
  if (!schemaReady) schemaReady = query(REGISTRY_STATE_SCHEMA).catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/**
 * Compare the complete catalog with a durable acknowledgment shared by every
 * replica. Redis loss, expiration, or failed publication cannot certify stale
 * metadata. SQL compares changed generations without rewriting identical rows.
 */
export function createPassportWatchCatalogRegistrar(dependencies: RegistryDependencies) {
  const now = dependencies.now ?? Date.now;

  return async function register(catalog: WatchCatalog): Promise<number> {
    const byRef = new Map<string, RegisteredWatchAsset>();
    for (const item of catalog.all) {
      const asset = registeredAsset(item);
      if (!asset) continue;
      const previous = byRef.get(asset.playbackRef);
      asset.aliases = [...new Set([...(previous?.aliases ?? []), ...asset.aliases])].sort();
      byRef.set(asset.playbackRef, asset);
    }
    const assets = [...byRef.values()];
    if (!assets.length) return 0;
    const fingerprints = new Map(assets.map((asset) => [asset.playbackRef, fingerprint({ ...asset, aliases: [...asset.aliases].sort() })]));
    const catalogFingerprint = fingerprint([...fingerprints].sort(([left], [right]) => left.localeCompare(right)));
    return dependencies.transaction(async (execute) => {
      const state = (await execute(`SELECT fingerprint,archive_confirmed_at,live_confirmed_at
        FROM passport_watch_registry_state WHERE singleton=true`, [])).rows?.[0];
      const acknowledgment: RegistryMarker | null = state ? {
        fingerprint: String(state.fingerprint),
        archiveConfirmedAt: Number(state.archive_confirmed_at),
        liveConfirmedAt: Number(state.live_confirmed_at),
      } : null;
      const timestamp = now();
      const sameGeneration = acknowledgment?.fingerprint === catalogFingerprint;
      const changed = assets.filter((asset) => {
        if (!sameGeneration) return true;
        const confirmedAt = asset.kind === "live" ? acknowledgment.liveConfirmedAt : acknowledgment.archiveConfirmedAt;
        return !Number.isFinite(confirmedAt) || timestamp < confirmedAt || timestamp - confirmedAt >= renewalInterval(asset);
      });
      if (!changed.length) return 0;

      let count = 0;
      for (let offset = 0; offset < changed.length; offset += REGISTRY_BATCH_SIZE) {
        const batch = changed.slice(offset, offset + REGISTRY_BATCH_SIZE);
        count += (await execute(REGISTER_ASSETS_SQL, [JSON.stringify(batch)])).rowCount ?? 0;
      }
      // Preserve the archive clock when only a live renewal is due. Changed
      // catalog generations were completely compared, so all clocks may renew.
      const archiveConfirmedAt = sameGeneration && !changed.some((asset) => asset.kind !== "live")
        ? acknowledgment.archiveConfirmedAt : timestamp;
      const liveConfirmedAt = sameGeneration && !changed.some((asset) => asset.kind === "live")
        ? acknowledgment.liveConfirmedAt : timestamp;
      await execute(`INSERT INTO passport_watch_registry_state
        (singleton,fingerprint,archive_confirmed_at,live_confirmed_at) VALUES (true,$1,$2,$3)
        ON CONFLICT(singleton) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,
          archive_confirmed_at=EXCLUDED.archive_confirmed_at,live_confirmed_at=EXCLUDED.live_confirmed_at`,
      [catalogFingerprint, archiveConfirmedAt, liveConfirmedAt]);
      return count;
    });
  };
}

const registerCatalog = createPassportWatchCatalogRegistrar({
  transaction: async (run) => {
    await ensureRegistryState();
    return withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ["passport-watch-registry:v1"]);
      return run((sql, values) => client.query(sql, [...values]));
    });
  },
});

/** Persist the complete server-normalized allowlist before rendering succeeds. */
export function registerPassportWatchCatalog(catalog: WatchCatalog): Promise<number> {
  return registerCatalog(catalog);
}
