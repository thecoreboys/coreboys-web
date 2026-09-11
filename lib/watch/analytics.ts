import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";

export type AccountWatchAnalytics = {
  totalSeconds: number;
  seconds7d: number;
  lastWatchedAt: string | null;
  byPlatform: Array<{ platform: string; totalSeconds: number; seconds7d: number }>;
  externalWatchHistoryAvailable: false;
};

/** Provider players embedded on CORE are CORE observations, not imported history. */
export async function accountWatchAnalytics(userId: string): Promise<AccountWatchAnalytics> {
  await ensureFanOauthSchema();
  const { rows } = await query<{ platform: string; seconds: string; seconds_7d: string; last_at: string | null }>(
    `SELECT COALESCE(playback_platform,'core') AS platform,
            COALESCE(SUM(seconds),0)::text AS seconds,
            COALESCE(SUM(seconds) FILTER (WHERE observed_at>now()-interval '7 days'),0)::text AS seconds_7d,
            MAX(observed_at)::text AS last_at
       FROM fan_watch_time_events
      WHERE user_id=$1 AND source='site' AND measured=true
      GROUP BY COALESCE(playback_platform,'core') ORDER BY SUM(seconds) DESC`, [userId],
  );
  return {
    totalSeconds: rows.reduce((sum, row) => sum + Number(row.seconds), 0),
    seconds7d: rows.reduce((sum, row) => sum + Number(row.seconds_7d), 0),
    lastWatchedAt: rows.reduce<string | null>((latest, row) => !latest || (row.last_at && Date.parse(row.last_at) > Date.parse(latest)) ? row.last_at : latest, null),
    byPlatform: rows.map((row) => ({ platform: row.platform, totalSeconds: Number(row.seconds), seconds7d: Number(row.seconds_7d) })),
    externalWatchHistoryAvailable: false,
  };
}
