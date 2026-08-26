import "server-only";

import { query, withTransaction } from "@/lib/db";
import {
  RADIO_NETWORK_SLUGS,
  isRadioNetworkSlug,
  networkTuneCandidates,
  selectCueCandidate,
  type RadioCueAsset,
  type RadioCueKind,
  type RadioNetworkSlug,
} from "./public-catalog";

export type RadioCueStatus = "draft" | "approved" | "archived";
export type RadioCueSource = "legacy" | "recorded" | "uploaded";
export type RadioCueRotationMode = "shuffle" | "ordered";

export type RadioCuePool = {
  id: string;
  key: string;
  kind: RadioCueKind;
  networkSlug: RadioNetworkSlug | null;
  title: string;
  enabled: boolean;
  rotationMode: RadioCueRotationMode;
  createdAt: string;
  updatedAt: string;
};

/** Full details are visible only to the protected admin route. */
export type StoredRadioCueAsset = Omit<RadioCueAsset, "audioUrl"> & {
  audioUrl: string | null;
  slug: string;
  status: RadioCueStatus;
  enabled: boolean;
  source: RadioCueSource;
  sourceLabel: string | null;
  durationMs: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type RadioCueSnapshot = { pools: RadioCuePool[]; assets: StoredRadioCueAsset[] };

export type SelectRadioCueInput = {
  kind: RadioCueKind;
  networkSlug: RadioNetworkSlug;
  /** The client holds short-lived playback history; no user event creates audio. */
  excludedIds?: readonly string[];
  random?: () => number;
};

export type RadioCueSelection = {
  cue: RadioCueAsset | null;
  candidates: RadioCueAsset[];
  source: "catalog" | "static-fallback" | "none";
};

export type CreateRadioCuePoolInput = {
  key: string;
  kind: RadioCueKind;
  networkSlug: RadioNetworkSlug | null;
  title: string;
  enabled?: boolean;
  rotationMode?: RadioCueRotationMode;
};

export type RadioCueAssetInput = {
  poolKey: string;
  slug: string;
  title: string;
  audioUrl: string | null;
  transcript?: string | null;
  spokenTemplate?: string | null;
  source?: RadioCueSource;
  sourceLabel?: string | null;
  durationMs?: number | null;
  status?: RadioCueStatus;
  enabled?: boolean;
  fallback?: boolean;
  sortOrder?: number;
};

export type CreateRadioCueAssetInput = RadioCueAssetInput & { createdBy?: string | null };
export type UpdateRadioCueAssetInput = RadioCueAssetInput & { id: string };
export type UpdateRadioCuePoolInput = Omit<RadioCuePool, "createdAt" | "updatedAt">;

type PoolRow = {
  id: string;
  key: string;
  cue_kind: RadioCueKind;
  network_slug: string | null;
  title: string;
  enabled: boolean;
  rotation_mode: RadioCueRotationMode;
  created_at: Date | string;
  updated_at: Date | string;
};

type AssetRow = PoolRow & {
  asset_id: string;
  slug: string;
  audio_url: string | null;
  transcript: string | null;
  spoken_template: string | null;
  status: RadioCueStatus;
  asset_enabled: boolean;
  source: RadioCueSource;
  source_label: string | null;
  duration_ms: number | null;
  is_fallback: boolean;
  sort_order: number;
  asset_created_at: Date | string;
  asset_updated_at: Date | string;
};

const CUE_KINDS: readonly RadioCueKind[] = ["tune_in", "live_takeover", "intermission", "outro"];
const CUE_STATUSES: readonly RadioCueStatus[] = ["draft", "approved", "archived"];
const CUE_SOURCES: readonly RadioCueSource[] = ["legacy", "recorded", "uploaded"];
const ROTATION_MODES: readonly RadioCueRotationMode[] = ["shuffle", "ordered"];

const RADIO_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS radio_cue_pools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(?:[-:][a-z0-9]+)*$'),
    cue_kind TEXT NOT NULL CHECK (cue_kind IN ('tune_in','live_takeover','intermission','outro')),
    network_slug TEXT CHECK (network_slug IS NULL OR network_slug IN ('core','adapt','ron','lacy','marlon','jason','silky')),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    rotation_mode TEXT NOT NULL DEFAULT 'shuffle' CHECK (rotation_mode IN ('shuffle','ordered')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS radio_cue_pools_lookup_idx
    ON radio_cue_pools (cue_kind, network_slug, enabled);
  CREATE TABLE IF NOT EXISTS radio_cue_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES radio_cue_pools(id) ON DELETE CASCADE,
    slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    audio_url TEXT,
    transcript TEXT,
    spoken_template TEXT,
    source TEXT NOT NULL DEFAULT 'recorded' CHECK (source IN ('legacy','recorded','uploaded')),
    source_label TEXT,
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms BETWEEN 250 AND 180000),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pool_id, slug),
    CHECK (status <> 'approved' OR audio_url IS NOT NULL)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS radio_cue_assets_one_fallback_per_pool_idx
    ON radio_cue_assets (pool_id) WHERE is_fallback AND status <> 'archived';
  CREATE INDEX IF NOT EXISTS radio_cue_assets_ready_idx
    ON radio_cue_assets (pool_id, status, enabled, sort_order, created_at)
    WHERE status = 'approved' AND enabled = TRUE;
`;

const ASSET_SELECT = `
  SELECT p.id::text,p.key,p.cue_kind,p.network_slug,p.title,p.enabled,p.rotation_mode,p.created_at,p.updated_at,
         a.id::text AS asset_id,a.slug,a.audio_url,a.transcript,a.spoken_template,a.status,
         a.enabled AS asset_enabled,a.source,a.source_label,a.duration_ms,a.is_fallback,a.sort_order,
         a.created_at AS asset_created_at,a.updated_at AS asset_updated_at
    FROM radio_cue_assets a
    JOIN radio_cue_pools p ON p.id=a.pool_id
`;

let schemaReady: Promise<void> | null = null;
let approvedCache: { expiresAt: number; value: Promise<StoredRadioCueAsset[]> } | null = null;
const APPROVED_CACHE_TTL_MS = 30_000;

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function poolFromRow(row: PoolRow): RadioCuePool {
  return {
    id: row.id,
    key: row.key,
    kind: row.cue_kind,
    networkSlug: isRadioNetworkSlug(row.network_slug) ? row.network_slug : null,
    title: row.title,
    enabled: row.enabled,
    rotationMode: row.rotation_mode,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function storedAssetFromRow(row: AssetRow): StoredRadioCueAsset {
  return {
    id: row.asset_id,
    poolKey: row.key,
    kind: row.cue_kind,
    networkSlug: isRadioNetworkSlug(row.network_slug) ? row.network_slug : null,
    title: row.title,
    audioUrl: row.audio_url,
    transcript: row.transcript,
    spokenTemplate: row.spoken_template,
    fallback: row.is_fallback,
    slug: row.slug,
    status: row.status,
    enabled: row.asset_enabled,
    source: row.source,
    sourceLabel: row.source_label,
    durationMs: row.duration_ms,
    sortOrder: row.sort_order,
    createdAt: toIso(row.asset_created_at),
    updatedAt: toIso(row.asset_updated_at),
  };
}

function publicAsset(asset: StoredRadioCueAsset): RadioCueAsset | null {
  if (!asset.audioUrl) return null;
  return {
    id: asset.id,
    poolKey: asset.poolKey,
    kind: asset.kind,
    networkSlug: asset.networkSlug,
    title: asset.title,
    audioUrl: asset.audioUrl,
    transcript: asset.transcript,
    spokenTemplate: asset.spokenTemplate,
    fallback: asset.fallback,
  };
}

function normalizeString(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function validPoolKey(value: string): boolean {
  return /^[a-z0-9]+(?:[-:][a-z0-9]+)*$/.test(value);
}

function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

/** Local public assets and HTTPS CDN URLs are the only valid playback sources. */
export function normalizeRadioAudioUrl(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 1_500) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//") && !normalized.includes("\\")) return normalized;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function known<T extends string>(value: T, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value)) throw new Error(`invalid_radio_${name}`);
  return value;
}

function clearApprovedCache() {
  approvedCache = null;
}

/**
 * Additive schema setup. It seeds only the seven recordings already checked
 * into public/audio/network-tunes and never performs TTS/model work.
 */
export function ensureRadioCueSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = query(RADIO_SCHEMA_SQL).then(async () => {
    for (const networkSlug of RADIO_NETWORK_SLUGS) {
      const label = networkSlug === "core" ? "CORE" : networkSlug;
      const pools: Array<[string, RadioCueKind, string]> = [
        [`tune-in:${networkSlug}`, "tune_in", `${label} tune-in`],
        [`live-takeover:${networkSlug}`, "live_takeover", `${label} live takeover`],
        [`intermission:${networkSlug}`, "intermission", `${label} intermission`],
        [`outro:${networkSlug}`, "outro", `${label} outro`],
      ];
      for (const [key, kind, title] of pools) {
        await query(
          `INSERT INTO radio_cue_pools (key,cue_kind,network_slug,title)
           VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO NOTHING`,
          [key, kind, networkSlug, title],
        );
      }
      const fallback = networkTuneCandidates(networkSlug)[0]!;
      await query(
        `INSERT INTO radio_cue_assets
           (id,pool_id,slug,title,audio_url,source,status,enabled,is_fallback,sort_order)
         SELECT $1,id,'station-tune',$2,$3,'legacy','approved',TRUE,TRUE,0
           FROM radio_cue_pools WHERE key=$4
         ON CONFLICT (id) DO NOTHING`,
        [fallback.id, fallback.title, fallback.audioUrl, `tune-in:${networkSlug}`],
      );
    }
  }).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function getStoredRadioCueAsset(id: string): Promise<StoredRadioCueAsset | null> {
  const result = await query<AssetRow>(`${ASSET_SELECT} WHERE a.id=$1`, [id]);
  const row = result.rows[0];
  return row ? storedAssetFromRow(row) : null;
}

async function listApprovedStoredCues(): Promise<StoredRadioCueAsset[]> {
  const now = Date.now();
  if (approvedCache && approvedCache.expiresAt > now) return approvedCache.value;
  const value = query<AssetRow>(
    `${ASSET_SELECT}
      WHERE p.enabled=TRUE AND a.enabled=TRUE AND a.status='approved' AND a.audio_url IS NOT NULL
      ORDER BY p.network_slug NULLS LAST,p.key,a.is_fallback DESC,a.sort_order,a.created_at`,
  ).then((result) => result.rows.map(storedAssetFromRow));
  approvedCache = { expiresAt: now + APPROVED_CACHE_TTL_MS, value };
  void value.catch(() => {
    if (approvedCache?.value === value) approvedCache = null;
  });
  return value;
}

export async function getRadioCueSnapshot(includeUnapproved = false): Promise<RadioCueSnapshot> {
  await ensureRadioCueSchema();
  const [pools, assets] = await Promise.all([
    query<PoolRow>("SELECT id::text,key,cue_kind,network_slug,title,enabled,rotation_mode,created_at,updated_at FROM radio_cue_pools ORDER BY cue_kind,network_slug NULLS FIRST,key"),
    query<AssetRow>(`${ASSET_SELECT}
      ${includeUnapproved ? "" : "WHERE p.enabled=TRUE AND a.enabled=TRUE AND a.status='approved' AND a.audio_url IS NOT NULL"}
      ORDER BY p.key,a.is_fallback DESC,a.sort_order,a.created_at`),
  ]);
  return { pools: pools.rows.map(poolFromRow), assets: assets.rows.map(storedAssetFromRow) };
}

/** Ready alternatives for client preloading. Only approved audio URLs leave this module. */
export async function getPublicRadioCues(kind: RadioCueKind, networkSlug: RadioNetworkSlug): Promise<RadioCueAsset[]> {
  await ensureRadioCueSchema();
  const records = await listApprovedStoredCues();
  const exact = records.filter((asset) => asset.kind === kind && asset.networkSlug === networkSlug);
  const global = records.filter((asset) => asset.kind === kind && asset.networkSlug === null);
  const selected = exact.length > 0 ? exact : global;
  const publicCandidates = selected.map(publicAsset).filter((asset): asset is RadioCueAsset => asset !== null);
  return (kind === "tune_in" && publicCandidates.length === 0
    ? networkTuneCandidates(networkSlug)
    : publicCandidates).slice(0, 32);
}

/**
 * One compact, public-safe manifest for app-session prefetching. It contains
 * only approved, enabled recordings and the already-public static fallback
 * intros—never drafts, review notes, creator credentials, or generation jobs.
 */
export async function getPublicRadioCueCatalog(networkSlug?: RadioNetworkSlug): Promise<RadioCueAsset[]> {
  const fallback = RADIO_NETWORK_SLUGS
    .filter((network) => !networkSlug || network === networkSlug)
    .flatMap((network) => networkTuneCandidates(network));
  try {
    await ensureRadioCueSchema();
    const approved = (await listApprovedStoredCues())
      .map(publicAsset)
      .filter((asset): asset is RadioCueAsset => asset !== null)
      .filter((asset) => !networkSlug || asset.networkSlug === networkSlug);
    // The UUIDs for the built-in tunes are shared between the static and DB
    // manifests, so this is also safe during a rolling migration deployment.
    const byId = new Map<string, RadioCueAsset>();
    for (const asset of [...fallback, ...approved]) byId.set(asset.id, asset);
    return [...byId.values()].slice(0, 240);
  } catch {
    return fallback;
  }
}

/**
 * Return a stored recording chosen from a pool. This is selection only: the
 * route has no prompt, no voice provider, and no user-triggered generation.
 */
export async function selectRadioCue(input: SelectRadioCueInput): Promise<RadioCueSelection> {
  try {
    const candidates = await getPublicRadioCues(input.kind, input.networkSlug);
    const cue = selectCueCandidate(candidates, { excludedIds: input.excludedIds, random: input.random });
    return {
      cue,
      candidates,
      source: candidates.length === 0 ? "none" : candidates.length === 1 && candidates[0]?.fallback ? "static-fallback" : "catalog",
    };
  } catch {
    // A database outage must not turn a click-to-tune transition into a loader.
    if (input.kind !== "tune_in") return { cue: null, candidates: [], source: "none" };
    const candidates = networkTuneCandidates(input.networkSlug);
    return {
      cue: selectCueCandidate(candidates, { excludedIds: input.excludedIds, random: input.random }),
      candidates,
      source: "static-fallback",
    };
  }
}

export async function createRadioCuePool(input: CreateRadioCuePoolInput): Promise<RadioCuePool> {
  await ensureRadioCueSchema();
  const key = normalizeKey(input.key);
  const title = normalizeString(input.title, 120);
  if (!validPoolKey(key) || !title || (input.networkSlug !== null && !isRadioNetworkSlug(input.networkSlug))) {
    throw new Error("invalid_radio_pool");
  }
  const result = await query<PoolRow>(
    `INSERT INTO radio_cue_pools (key,cue_kind,network_slug,title,enabled,rotation_mode)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id::text,key,cue_kind,network_slug,title,enabled,rotation_mode,created_at,updated_at`,
    [key, known(input.kind, CUE_KINDS, "kind"), input.networkSlug, title, input.enabled ?? true, known(input.rotationMode ?? "shuffle", ROTATION_MODES, "rotation_mode")],
  );
  clearApprovedCache();
  return poolFromRow(result.rows[0]!);
}

export async function updateRadioCuePool(input: UpdateRadioCuePoolInput): Promise<RadioCuePool> {
  await ensureRadioCueSchema();
  const key = normalizeKey(input.key);
  const title = normalizeString(input.title, 120);
  if (!validPoolKey(key) || !title || (input.networkSlug !== null && !isRadioNetworkSlug(input.networkSlug))) {
    throw new Error("invalid_radio_pool");
  }
  const result = await query<PoolRow>(
    `UPDATE radio_cue_pools
        SET key=$2,cue_kind=$3,network_slug=$4,title=$5,enabled=$6,rotation_mode=$7,updated_at=NOW()
      WHERE id=$1
      RETURNING id::text,key,cue_kind,network_slug,title,enabled,rotation_mode,created_at,updated_at`,
    [input.id, key, known(input.kind, CUE_KINDS, "kind"), input.networkSlug, title, input.enabled, known(input.rotationMode, ROTATION_MODES, "rotation_mode")],
  );
  const row = result.rows[0];
  if (!row) throw new Error("radio_pool_not_found");
  clearApprovedCache();
  return poolFromRow(row);
}

function prepareAsset(input: RadioCueAssetInput) {
  const poolKey = normalizeKey(input.poolKey);
  const slug = normalizeKey(input.slug);
  const title = normalizeString(input.title, 160);
  const audioUrl = normalizeRadioAudioUrl(input.audioUrl);
  const status = known(input.status ?? "draft", CUE_STATUSES, "status");
  const source = known(input.source ?? "recorded", CUE_SOURCES, "source");
  const durationMs = input.durationMs == null ? null : Math.trunc(input.durationMs);
  if (!validPoolKey(poolKey) || !validSlug(slug) || !title || (input.audioUrl != null && !audioUrl) || (status === "approved" && !audioUrl)) {
    throw new Error("invalid_radio_asset");
  }
  if (durationMs != null && (durationMs < 250 || durationMs > 180_000)) throw new Error("invalid_radio_duration");
  return {
    poolKey,
    slug,
    title,
    audioUrl,
    transcript: normalizeString(input.transcript, 4_000),
    spokenTemplate: normalizeString(input.spokenTemplate, 2_000),
    source,
    sourceLabel: normalizeString(input.sourceLabel, 160),
    durationMs,
    status,
    enabled: input.enabled ?? true,
    fallback: input.fallback ?? false,
    sortOrder: Math.max(0, Math.min(10_000, Math.trunc(input.sortOrder ?? 100))),
  };
}

async function resolvePoolId(poolKey: string, client: { query: typeof query }): Promise<string> {
  const result = await client.query<{ id: string }>("SELECT id::text FROM radio_cue_pools WHERE key=$1 FOR UPDATE", [poolKey]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("radio_pool_not_found");
  return id;
}

export async function createRadioCueAsset(input: CreateRadioCueAssetInput): Promise<StoredRadioCueAsset> {
  await ensureRadioCueSchema();
  const prepared = prepareAsset(input);
  const created = await withTransaction(async (client) => {
    const poolId = await resolvePoolId(prepared.poolKey, client);
    if (prepared.fallback) await client.query("UPDATE radio_cue_assets SET is_fallback=FALSE WHERE pool_id=$1", [poolId]);
    const result = await client.query<{ id: string }>(
      `INSERT INTO radio_cue_assets
        (pool_id,slug,title,audio_url,transcript,spoken_template,source,source_label,duration_ms,status,enabled,is_fallback,sort_order,created_by,reviewed_by,reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $10='approved' THEN $14 ELSE NULL END,CASE WHEN $10='approved' THEN NOW() ELSE NULL END)
       RETURNING id::text`,
      [poolId, prepared.slug, prepared.title, prepared.audioUrl, prepared.transcript, prepared.spokenTemplate, prepared.source, prepared.sourceLabel, prepared.durationMs, prepared.status, prepared.enabled, prepared.fallback, prepared.sortOrder, input.createdBy ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("radio_asset_create_failed");
    return id;
  });
  clearApprovedCache();
  const asset = await getStoredRadioCueAsset(created);
  if (!asset) throw new Error("radio_asset_create_failed");
  return asset;
}

export async function updateRadioCueAsset(input: UpdateRadioCueAssetInput, reviewedBy?: string | null): Promise<StoredRadioCueAsset> {
  await ensureRadioCueSchema();
  const prepared = prepareAsset(input);
  const updated = await withTransaction(async (client) => {
    const poolId = await resolvePoolId(prepared.poolKey, client);
    if (prepared.fallback) await client.query("UPDATE radio_cue_assets SET is_fallback=FALSE WHERE pool_id=$1 AND id<>$2", [poolId, input.id]);
    const result = await client.query<{ id: string }>(
      `UPDATE radio_cue_assets
          SET pool_id=$2,slug=$3,title=$4,audio_url=$5,transcript=$6,spoken_template=$7,source=$8,source_label=$9,
              duration_ms=$10,status=$11,enabled=$12,is_fallback=$13,sort_order=$14,
              reviewed_by=CASE WHEN $11='approved' THEN $15 ELSE reviewed_by END,
              reviewed_at=CASE WHEN $11='approved' THEN NOW() ELSE reviewed_at END,updated_at=NOW()
        WHERE id=$1 RETURNING id::text`,
      [input.id, poolId, prepared.slug, prepared.title, prepared.audioUrl, prepared.transcript, prepared.spokenTemplate, prepared.source, prepared.sourceLabel, prepared.durationMs, prepared.status, prepared.enabled, prepared.fallback, prepared.sortOrder, reviewedBy ?? null],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("radio_asset_not_found");
    return id;
  });
  clearApprovedCache();
  const asset = await getStoredRadioCueAsset(updated);
  if (!asset) throw new Error("radio_asset_not_found");
  return asset;
}

/** Archive recordings instead of deleting them, preserving the cue library history. */
export async function archiveRadioCueAsset(id: string): Promise<void> {
  await ensureRadioCueSchema();
  await query(
    "UPDATE radio_cue_assets SET status='archived',enabled=FALSE,is_fallback=FALSE,updated_at=NOW() WHERE id=$1",
    [id],
  );
  clearApprovedCache();
}
