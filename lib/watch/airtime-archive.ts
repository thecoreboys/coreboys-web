import "server-only";

import { query } from "@/lib/db";
import type { AirtimeDailyRecord } from "@/lib/watch/airtime-history";

/**
 * Compact daily data intended for long-lived Guide heatmaps. `date` is a UTC
 * calendar date. Recent detailed sessions are still layered over this data by
 * the client so a viewer-local day remains precise around midnight.
 */
export type AirtimeDailyArchive = AirtimeDailyRecord & {
  archivedAt: string;
};

type AirtimeArchiveRow = {
  member_slug: string;
  archive_date: string;
  minutes_streamed: number | string;
  broadcasts: number | string;
  peak_viewers: number | string;
  archived_at: string;
};

type RefreshRow = {
  affected_rows: number | string | null;
};

export type AirtimeArchiveRefreshResult = {
  refreshed: boolean;
  affectedRows: number;
  startDate: string;
  endDate: string;
};

const DAY_MS = 86_400_000;
const RECENT_REFRESH_INTERVAL_MS = 4 * 60_000;
const DEFAULT_REFRESH_DAYS = 400;

let lastRefreshAt = 0;
let refreshInFlight: Promise<AirtimeArchiveRefreshResult | null> | null = null;

function asFiniteInteger(value: number | string | null | undefined): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startDateForDays(days: number, now = new Date()): string {
  const normalizedDays = Math.max(1, Math.floor(days));
  const start = new Date(now.getTime() - (normalizedDays - 1) * DAY_MS);
  return utcDateKey(start);
}

/**
 * Read the durable archive. A deployment that has not applied migration 030
 * simply gets an empty history; public Watch/Guide surfaces keep working from
 * their existing recent session and VOD sources.
 */
export async function loadAirtimeDailyArchive({
  days = 370,
  memberSlug,
  now = new Date(),
}: {
  days?: number;
  memberSlug?: string | null;
  now?: Date;
} = {}): Promise<AirtimeDailyArchive[]> {
  const normalizedSlug = memberSlug?.trim() || null;
  try {
    const result = await query<AirtimeArchiveRow>(
      `SELECT member_slug,
              archive_date::text,
              minutes_streamed,
              broadcasts,
              peak_viewers,
              archived_at::text
         FROM airtime_daily_archive
        WHERE archive_date >= $1::date
          AND ($2::text IS NULL OR member_slug = $2)
        ORDER BY archive_date ASC, member_slug ASC`,
      [startDateForDays(days, now), normalizedSlug],
    );
    return result.rows.map((row) => ({
      slug: row.member_slug,
      date: row.archive_date.slice(0, 10),
      minutes: asFiniteInteger(row.minutes_streamed),
      sessions: asFiniteInteger(row.broadcasts),
      peakViewers: asFiniteInteger(row.peak_viewers),
      archivedAt: row.archived_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Keep current and recent archive cells fresh from the detailed observation
 * ledger. The function lives in migration 030; failure is deliberately
 * swallowed so an app rollout awaiting that migration never breaks live
 * session reconciliation or the daily TwitchTracker collector.
 */
export async function refreshAirtimeDailyArchive({
  days = DEFAULT_REFRESH_DAYS,
  force = false,
  now = new Date(),
}: {
  days?: number;
  force?: boolean;
  now?: Date;
} = {}): Promise<AirtimeArchiveRefreshResult | null> {
  if (refreshInFlight) return refreshInFlight;
  const nowMs = now.getTime();
  if (!force && nowMs - lastRefreshAt < RECENT_REFRESH_INTERVAL_MS) return null;

  const startDate = startDateForDays(days, now);
  const endDate = utcDateKey(now);
  refreshInFlight = (async () => {
    try {
      const result = await query<RefreshRow>(
        `SELECT refresh_airtime_daily_archive($1::date, $2::date) AS affected_rows`,
        [startDate, endDate],
      );
      lastRefreshAt = nowMs;
      return {
        refreshed: true,
        affectedRows: asFiniteInteger(result.rows[0]?.affected_rows),
        startDate,
        endDate,
      };
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
