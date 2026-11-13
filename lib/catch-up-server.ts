import "server-only";
import { query } from "@/lib/db";
import { getSocialNotificationSettings } from "@/lib/social-events";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { watchRefsFor } from "@/lib/watch/channel-browse-signals";
import type { WatchItem } from "@/lib/watch/types";
import {
  CATCH_UP_FIRST_VISIT_MS,
  CATCH_UP_MAX_LOOKBACK_MS,
  catchUpItemKey,
  groupCatchUp,
  selectCatchUp,
  summarizeCatchUp,
  type CatchUpResponse,
  type CatchUpSummary,
} from "@/lib/catch-up";

let schemaReady: Promise<boolean> | null = null;

/**
 * Mirrors scripts/migrations/072_fan_catch_up.sql so the feature works before
 * the migration runs. If the database role cannot create tables, catch-up
 * stays readable (first-visit window, nothing persisted) instead of failing.
 */
export function ensureCatchUpSchema(): Promise<boolean> {
  schemaReady ??= (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS fan_catch_up_state (
          user_id TEXT PRIMARY KEY REFERENCES fan_users(id) ON DELETE CASCADE,
          seen_through TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
      await query(`
        CREATE TABLE IF NOT EXISTS fan_catch_up_seen (
          user_id TEXT NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
          item_key TEXT NOT NULL,
          seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, item_key)
        )`);
      return true;
    } catch (error) {
      console.warn("[catch-up] schema unavailable; serving read-only catch-up", error instanceof Error ? error.message : error);
      // Retry on a later request rather than caching a transient failure forever.
      setTimeout(() => { schemaReady = null; }, 60_000).unref?.();
      return false;
    }
  })();
  return schemaReady;
}

async function loadState(userId: string, persistent: boolean, now: number): Promise<{ since: number; seen: Set<string> }> {
  const fallback = { since: now - CATCH_UP_FIRST_VISIT_MS, seen: new Set<string>() };
  if (!persistent) return fallback;
  // A first visit anchors the window once, so the count does not drift as time passes.
  await query(
    `INSERT INTO fan_catch_up_state (user_id, seen_through)
     VALUES ($1, $2::timestamptz)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, new Date(fallback.since).toISOString()],
  );
  const state = await query<{ seen_through: string }>(
    `SELECT seen_through::text FROM fan_catch_up_state WHERE user_id = $1`,
    [userId],
  );
  const since = Date.parse(state.rows[0]?.seen_through ?? "");
  const seen = await query<{ item_key: string }>(
    `SELECT item_key FROM fan_catch_up_seen WHERE user_id = $1 AND seen_at > now() - interval '45 days'`,
    [userId],
  );
  return { since: Number.isFinite(since) ? since : fallback.since, seen: new Set(seen.rows.map((row) => row.item_key)) };
}

/** Refs this fan already played on CORE since the window opened. */
async function loadWatchedRefs(userId: string, since: number): Promise<Set<string>> {
  try {
    const { rows } = await query<{ item_ref: string }>(
      `SELECT item_ref FROM fan_watch_progress
        WHERE user_id = $1 AND updated_at >= $2::timestamptz AND (seconds > 0 OR progress > 0)`,
      [userId, new Date(Math.max(since, Date.now() - CATCH_UP_MAX_LOOKBACK_MS)).toISOString()],
    );
    return new Set(rows.map((row) => row.item_ref));
  } catch {
    return new Set();
  }
}

async function catalogItems() {
  return (await getWatchCatalog()).all;
}

/** `loadItems` defaults to the live Watch catalog; tests pass fixed items. */
export async function getCatchUp(
  userId: string,
  now = Date.now(),
  loadItems: () => Promise<readonly WatchItem[]> = catalogItems,
): Promise<CatchUpResponse> {
  const persistent = await ensureCatchUpSchema();
  const [state, settings, items] = await Promise.all([
    loadState(userId, persistent, now).catch(() => ({ since: now - CATCH_UP_FIRST_VISIT_MS, seen: new Set<string>() })),
    getSocialNotificationSettings(userId).catch(() => null),
    loadItems(),
  ]);
  const watchedRefs = await loadWatchedRefs(userId, state.since);
  const watched = new Set<string>();
  if (watchedRefs.size) {
    for (const item of items) {
      if (watchRefsFor(item).some((ref) => watchedRefs.has(ref))) watched.add(catchUpItemKey(item));
    }
  }
  const selection = selectCatchUp({
    items,
    since: state.since,
    now,
    rules: settings?.rules ?? [],
    seen: state.seen,
    watched,
  });
  return {
    ...summarizeCatchUp(selection),
    generatedAt: new Date(now).toISOString(),
    entries: selection.entries,
    liveEntries: selection.liveNow,
    groups: groupCatchUp(selection.entries),
    persistent,
  };
}

export async function getCatchUpSummary(userId: string): Promise<CatchUpSummary> {
  const { count, since, creators, liveNow } = await getCatchUp(userId);
  return { count, since, creators, liveNow };
}

export async function markCatchUpItemsSeen(userId: string, keys: readonly string[]): Promise<number> {
  if (!keys.length || !(await ensureCatchUpSchema())) return 0;
  const result = await query(
    `INSERT INTO fan_catch_up_seen (user_id, item_key)
     SELECT $1, key FROM UNNEST($2::text[]) AS key
     ON CONFLICT (user_id, item_key) DO UPDATE SET seen_at = now()`,
    [userId, [...new Set(keys)]],
  );
  return result.rowCount ?? 0;
}

/**
 * Advances the cursor to `through` (the moment the fan's list was generated)
 * so anything that arrived while they were reading stays new.
 */
export async function markAllCatchUpSeen(userId: string, through: Date): Promise<boolean> {
  if (!(await ensureCatchUpSchema())) return false;
  const bounded = new Date(Math.min(through.getTime(), Date.now()));
  await query(
    `INSERT INTO fan_catch_up_state (user_id, seen_through, updated_at)
     VALUES ($1, $2::timestamptz, now())
     ON CONFLICT (user_id) DO UPDATE
       SET seen_through = GREATEST(fan_catch_up_state.seen_through, EXCLUDED.seen_through),
           updated_at = now()`,
    [userId, bounded.toISOString()],
  );
  // Per-item marks older than the cursor can never matter again.
  await query(`DELETE FROM fan_catch_up_seen WHERE user_id = $1 AND seen_at < now() - interval '45 days'`, [userId]);
  return true;
}

export async function exportCatchUpState(userId: string) {
  if (!(await ensureCatchUpSchema())) return null;
  const [state, seen] = await Promise.all([
    query<{ seen_through: string; updated_at: string }>(
      `SELECT seen_through::text, updated_at::text FROM fan_catch_up_state WHERE user_id = $1`, [userId]),
    query<{ item_key: string; seen_at: string }>(
      `SELECT item_key, seen_at::text FROM fan_catch_up_seen WHERE user_id = $1 ORDER BY seen_at DESC`, [userId]),
  ]);
  return { seenThrough: state.rows[0]?.seen_through ?? null, seenItems: seen.rows };
}
