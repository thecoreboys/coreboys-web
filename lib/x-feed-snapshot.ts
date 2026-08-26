import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { revalidateTag, unstable_cache } from "next/cache";
import type { PoolClient } from "pg";
import type { FeedItem } from "@/components/feed/types";
import { query, withTransaction } from "@/lib/db";
import {
  X_FEED_LOCAL_QA_MAX_AGE_HOURS,
  X_FEED_PUBLIC_MAX_AGE_HOURS,
  xFeedSnapshotWithinAge,
} from "@/lib/x-feed-freshness";

const SNAPSHOT_KEY = "core-roster";
const LOCK_KEY = "coreboys:x-feed-refresh:v1";
const SNAPSHOT_CACHE_TAG = "coreboys:x-feed-snapshot";
// A six-month roster backfill can be much larger than the small recent-search
// window, especially once photo/video posts are expanded into feed entries.
const MAX_SNAPSHOT_ITEMS = 12_000;
const HISTORY_MONTHS = 6;
const DEFAULT_REFRESH_MINUTES = 5;

type SnapshotRow = {
  payload: unknown;
  refreshed_at: Date | string | null;
  attempted_at: Date | string | null;
  history_backfilled_at?: Date | string | null;
};

type LocalSnapshotRow = {
  payload: unknown;
  refreshedAt: string | null;
  attemptedAt: string | null;
  lastError: string | null;
};

export type XFeedRefreshResult = {
  ok: boolean;
  status: "refreshed" | "not_due" | "locked" | "failed";
  count: number;
  refreshedAt: string | null;
};

let schemaReady: Promise<void> | null = null;

declare global {
  // Keep one local refresh promise across Next.js hot reloads. This is only a
  // development fallback; production refreshes use the Postgres advisory lock.
  // eslint-disable-next-line no-var
  var __coreboysXLocalRefresh: Promise<XFeedRefreshResult> | undefined;
}

function localSnapshotPath(): string {
  const configured = process.env.X_FEED_LOCAL_SNAPSHOT_PATH?.trim();
  return configured
    ? resolve(configured)
    : resolve(process.cwd(), ".cache", "x-feed-snapshot.json");
}

function localSnapshotReadable(): boolean {
  return process.env.NODE_ENV !== "production";
}

function refreshMinutes(): number {
  const parsed = Number(process.env.X_FEED_REFRESH_MINUTES);
  if (!Number.isFinite(parsed)) return DEFAULT_REFRESH_MINUTES;
  return Math.max(5, Math.min(24 * 60, Math.trunc(parsed)));
}

function withinHistoryWindow(publishedAt: string): boolean {
  const time = Date.parse(publishedAt);
  if (!Number.isFinite(time)) return false;
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - HISTORY_MONTHS);
  return time >= cutoff.getTime();
}

function validDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validXUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (host === "x.com" || host === "twitter.com");
  } catch {
    return false;
  }
}

function isFeedItem(value: unknown): value is FeedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FeedItem>;
  return (
    item.platform === "x" &&
    typeof item.id === "string" && item.id.length > 0 && item.id.length <= 180 &&
    typeof item.title === "string" && item.title.length > 0 && item.title.length <= 30_000 &&
    typeof item.authorLabel === "string" && item.authorLabel.length > 0 && item.authorLabel.length <= 160 &&
    (item.authorSlug === null || typeof item.authorSlug === "string") &&
    validDate(item.publishedAt) &&
    validXUrl(item.sourceUrl ?? item.url)
  );
}

function normalizeItems(value: unknown): FeedItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const candidate of value) {
    if (!isFeedItem(candidate) || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (!withinHistoryWindow(candidate.publishedAt)) continue;
    items.push(candidate);
    if (items.length === MAX_SNAPSHOT_ITEMS) break;
  }
  return items;
}

function mergeItems(newest: readonly FeedItem[], existing: readonly FeedItem[]): FeedItem[] {
  return normalizeItems([...newest, ...existing])
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function localDate(value: unknown): string | null {
  return typeof value === "string" && validDate(value)
    ? new Date(value).toISOString()
    : null;
}

async function readLocalSnapshot(): Promise<LocalSnapshotRow | null> {
  if (!localSnapshotReadable()) return null;
  try {
    const parsed: unknown = JSON.parse(await readFile(localSnapshotPath(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const row = parsed as Partial<LocalSnapshotRow>;
    return {
      payload: normalizeItems(row.payload),
      refreshedAt: localDate(row.refreshedAt),
      attemptedAt: localDate(row.attemptedAt),
      lastError: typeof row.lastError === "string" ? row.lastError.slice(0, 180) : null,
    };
  } catch {
    return null;
  }
}

async function writeLocalSnapshot(row: LocalSnapshotRow): Promise<void> {
  const path = localSnapshotPath();
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(row)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = query(`
    CREATE TABLE IF NOT EXISTS x_feed_snapshots (
      cache_key TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '[]'::jsonb,
      refreshed_at TIMESTAMPTZ,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_error TEXT,
      CONSTRAINT x_feed_snapshots_payload_array
        CHECK (jsonb_typeof(payload) = 'array')
    );
    ALTER TABLE x_feed_snapshots ADD COLUMN IF NOT EXISTS history_backfilled_at TIMESTAMPTZ
  `).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

/**
 * Render-path reader. It only talks to Postgres and never falls back to X.
 * Content older than 24 hours is hidden so deleted/edited/protected posts are
 * not served indefinitely when the refresh job is unhealthy.
 */
async function readXFeedSnapshot(): Promise<FeedItem[]> {
  try {
    const result = await query<SnapshotRow>(
      `SELECT payload, refreshed_at, attempted_at, history_backfilled_at
       FROM x_feed_snapshots
       WHERE cache_key = $1
         AND refreshed_at >= NOW() - ($2::text || ' hours')::interval
       LIMIT 1`,
      [SNAPSHOT_KEY, String(X_FEED_PUBLIC_MAX_AGE_HOURS)],
    );
    const row = result.rows[0];
    if (row) return normalizeItems(row.payload);
  } catch {
    // Local development can use a durable disk snapshot populated only by the
    // protected refresh endpoint. Render paths still never contact X.
  }
  const local = await readLocalSnapshot();
  // The workstation has no hourly scheduler. During local QA only, keep the
  // last protected snapshot usable for a bounded week so every creator rail
  // can be tested without turning a page view into a paid X request.
  return xFeedSnapshotWithinAge(
    local?.refreshedAt,
    X_FEED_LOCAL_QA_MAX_AGE_HOURS,
  )
    ? normalizeItems(local?.payload)
    : [];
}

// Render paths share this short-lived cache. A page view can only read the
// already-sanitized snapshot; it never invokes X and it normally does not add
// another database read for every visitor either. The refresh writer purges
// the tag immediately after a successful new roster pull.
const cachedXFeedSnapshot = unstable_cache(
  readXFeedSnapshot,
  ["coreboys", "x-feed-snapshot", "v1"],
  { revalidate: 60, tags: [SNAPSHOT_CACHE_TAG] },
);

export async function getXFeedSnapshot(): Promise<FeedItem[]> {
  return cachedXFeedSnapshot();
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function currentSnapshot(client: PoolClient): Promise<SnapshotRow | null> {
  const result = await client.query<SnapshotRow>(
    `SELECT payload, refreshed_at, attempted_at, history_backfilled_at
     FROM x_feed_snapshots
     WHERE cache_key = $1
     FOR UPDATE`,
    [SNAPSHOT_KEY],
  );
  return result.rows[0] ?? null;
}

function safeErrorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "x_refresh_failed";
  return error.name === "AbortError"
    ? "x_refresh_timeout"
    : error.message.replace(/[\r\n\t]+/g, " ").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 180) || "x_refresh_failed";
}

/**
 * Cron-only writer. A transaction-scoped advisory lock guarantees that
 * overlapping jobs across processes/instances cannot both call X.
 */
export async function refreshXFeedSnapshot(
  fetchOnce: (existing: { historyBackfilled: boolean }) => Promise<FeedItem[]>,
  options?: { historyBackfilled?: () => boolean },
): Promise<XFeedRefreshResult> {
  await ensureSchema();
  const result = await withTransaction<XFeedRefreshResult>(async (client) => {
    const lock = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
      [LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) {
      return { ok: true, status: "locked", count: 0, refreshedAt: null };
    }

    const existing = await currentSnapshot(client);
    const attemptedAt = iso(existing?.attempted_at);
    if (attemptedAt) {
      const ageMs = Date.now() - Date.parse(attemptedAt);
      if (ageMs >= 0 && ageMs < refreshMinutes() * 60_000) {
        return {
          ok: true,
          status: "not_due",
          count: normalizeItems(existing?.payload).length,
          refreshedAt: iso(existing?.refreshed_at),
        };
      }
    }

    try {
      const items = mergeItems(
        normalizeItems(await fetchOnce({ historyBackfilled: Boolean(existing?.history_backfilled_at) })),
        normalizeItems(existing?.payload),
      );
      const refreshedAt = new Date().toISOString();
      await client.query(
        `INSERT INTO x_feed_snapshots
           (cache_key, payload, refreshed_at, attempted_at, last_error, history_backfilled_at)
         VALUES ($1, $2::jsonb, $3, $3, NULL, $4)
         ON CONFLICT (cache_key) DO UPDATE SET
           payload = EXCLUDED.payload,
           refreshed_at = EXCLUDED.refreshed_at,
           attempted_at = EXCLUDED.attempted_at,
           last_error = NULL,
           history_backfilled_at = COALESCE(EXCLUDED.history_backfilled_at, x_feed_snapshots.history_backfilled_at)`,
        [SNAPSHOT_KEY, JSON.stringify(items), refreshedAt, options?.historyBackfilled?.() ? refreshedAt : null],
      );
      return { ok: true, status: "refreshed", count: items.length, refreshedAt };
    } catch (error) {
      await client.query(
        `INSERT INTO x_feed_snapshots (cache_key, attempted_at, last_error)
         VALUES ($1, NOW(), $2)
         ON CONFLICT (cache_key) DO UPDATE SET
           attempted_at = EXCLUDED.attempted_at,
           last_error = EXCLUDED.last_error`,
        [SNAPSHOT_KEY, safeErrorLabel(error)],
      );
      return {
        ok: false,
        status: "failed",
        count: normalizeItems(existing?.payload).length,
        refreshedAt: iso(existing?.refreshed_at),
      };
    }
  });
  if (result.status === "refreshed") revalidateTag(SNAPSHOT_CACHE_TAG);
  return result;
}

/**
 * Development-only writer for workstations without the production Postgres
 * cluster. It is opt-in, throttled, process-coalesced, and persists to an
 * ignored local cache file. The public render path reads that file and never
 * calls X, preserving the one-server-read architecture during local QA.
 */
export async function refreshLocalXFeedSnapshot(
  fetchOnce: () => Promise<FeedItem[]>,
): Promise<XFeedRefreshResult> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.X_FEED_ALLOW_LOCAL_REFRESH !== "true"
  ) {
    throw new Error("Local X feed refresh is not enabled");
  }

  if (globalThis.__coreboysXLocalRefresh) {
    return globalThis.__coreboysXLocalRefresh;
  }

  const pending = (async (): Promise<XFeedRefreshResult> => {
    const existing = await readLocalSnapshot();
    const attemptedAt = existing?.attemptedAt;
    if (attemptedAt) {
      const ageMs = Date.now() - Date.parse(attemptedAt);
      if (ageMs >= 0 && ageMs < refreshMinutes() * 60_000) {
        return {
          ok: true,
          status: "not_due",
          count: normalizeItems(existing.payload).length,
          refreshedAt: existing.refreshedAt,
        };
      }
    }

    const now = new Date().toISOString();
    await writeLocalSnapshot({
      payload: normalizeItems(existing?.payload),
      refreshedAt: existing?.refreshedAt ?? null,
      attemptedAt: now,
      lastError: existing?.lastError ?? null,
    });

    try {
      const items = mergeItems(
        normalizeItems(await fetchOnce()),
        normalizeItems(existing?.payload),
      );
      await writeLocalSnapshot({
        payload: items,
        refreshedAt: now,
        attemptedAt: now,
        lastError: null,
      });
      return {
        ok: true,
        status: "refreshed",
        count: items.length,
        refreshedAt: now,
      };
    } catch (error) {
      await writeLocalSnapshot({
        payload: normalizeItems(existing?.payload),
        refreshedAt: existing?.refreshedAt ?? null,
        attemptedAt: now,
        lastError: safeErrorLabel(error),
      });
      return {
        ok: false,
        status: "failed",
        count: normalizeItems(existing?.payload).length,
        refreshedAt: existing?.refreshedAt ?? null,
      };
    }
  })();

  globalThis.__coreboysXLocalRefresh = pending;
  try {
    return await pending;
  } finally {
    if (globalThis.__coreboysXLocalRefresh === pending) {
      globalThis.__coreboysXLocalRefresh = undefined;
    }
  }
}
