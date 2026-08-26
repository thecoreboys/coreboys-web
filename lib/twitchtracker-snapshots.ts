import "server-only";
import { query } from "@/lib/db";

export type TwitchTrackerChannelSnapshot = {
  memberSlug: string;
  twitchLogin: string;
  snapshotDate: string;
  windowDays: number;
  rank: number | null;
  minutesStreamed: number;
  avgViewers: number;
  maxViewers: number;
  hoursWatched: number;
  followersGained: number;
  followersTotal: number;
  fetchedAt: string;
};

export type TwitchTrackerGameSnapshot = {
  lookupKey: string;
  gameName: string | null;
  snapshotDate: string;
  windowDays: number;
  rank: number | null;
  avgViewers: number;
  avgChannels: number;
  hoursWatched: number;
  fetchedAt: string;
};

export type TwitchTrackerAnalytics = {
  latest: TwitchTrackerChannelSnapshot[];
  history: TwitchTrackerChannelSnapshot[];
  games: TwitchTrackerGameSnapshot[];
};

type ChannelRow = {
  member_slug: string;
  twitch_login: string;
  snapshot_date: string;
  window_days: number;
  rank: number | null;
  minutes_streamed: number;
  avg_viewers: number;
  max_viewers: number;
  hours_watched: string;
  followers_gained: number;
  followers_total: string;
  fetched_at: string;
};

type GameRow = {
  lookup_key: string;
  game_name: string | null;
  snapshot_date: string;
  window_days: number;
  rank: number | null;
  avg_viewers: number;
  avg_channels: number;
  hours_watched: string;
  fetched_at: string;
};

function isoTimestamp(value: string): string {
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

function channelSnapshot(row: ChannelRow): TwitchTrackerChannelSnapshot {
  return {
    memberSlug: row.member_slug,
    twitchLogin: row.twitch_login,
    snapshotDate: row.snapshot_date.slice(0, 10),
    windowDays: row.window_days,
    rank: row.rank,
    minutesStreamed: row.minutes_streamed,
    avgViewers: row.avg_viewers,
    maxViewers: row.max_viewers,
    hoursWatched: Number(row.hours_watched),
    followersGained: row.followers_gained,
    followersTotal: Number(row.followers_total),
    fetchedAt: isoTimestamp(row.fetched_at),
  };
}

function gameSnapshot(row: GameRow): TwitchTrackerGameSnapshot {
  return {
    lookupKey: row.lookup_key,
    gameName: row.game_name,
    snapshotDate: row.snapshot_date.slice(0, 10),
    windowDays: row.window_days,
    rank: row.rank,
    avgViewers: row.avg_viewers,
    avgChannels: Number(row.avg_channels),
    hoursWatched: Number(row.hours_watched),
    fetchedAt: isoTimestamp(row.fetched_at),
  };
}

async function loadLatestChannels(): Promise<TwitchTrackerChannelSnapshot[]> {
  try {
    const result = await query<ChannelRow>(`
      SELECT DISTINCT ON (member_slug)
             member_slug, twitch_login, snapshot_date::text, window_days,
             rank, minutes_streamed, avg_viewers, max_viewers,
             hours_watched::text, followers_gained, followers_total::text,
             fetched_at::text
        FROM twitchtracker_channel_snapshots
       ORDER BY member_slug, snapshot_date DESC, fetched_at DESC
    `);
    return result.rows.map(channelSnapshot);
  } catch {
    return [];
  }
}

async function loadChannelHistory(): Promise<TwitchTrackerChannelSnapshot[]> {
  try {
    const result = await query<ChannelRow>(`
      SELECT member_slug, twitch_login, snapshot_date::text, window_days,
             rank, minutes_streamed, avg_viewers, max_viewers,
             hours_watched::text, followers_gained, followers_total::text,
             fetched_at::text
        FROM twitchtracker_channel_snapshots
       ORDER BY snapshot_date ASC, member_slug ASC
    `);
    return result.rows.map(channelSnapshot);
  } catch {
    return [];
  }
}

async function loadLatestGames(): Promise<TwitchTrackerGameSnapshot[]> {
  try {
    const result = await query<GameRow>(`
      SELECT DISTINCT ON (lookup_key)
             lookup_key, game_name, snapshot_date::text, window_days,
             rank, avg_viewers, avg_channels, hours_watched::text,
             fetched_at::text
        FROM twitchtracker_game_snapshots
       ORDER BY lookup_key, snapshot_date DESC, fetched_at DESC
    `);
    return result.rows.map(gameSnapshot);
  } catch {
    return [];
  }
}

/**
 * Read durable TwitchTracker snapshots. Each table is isolated behind its own
 * fallback so a deployment awaiting migration still serves every public page.
 */
export async function loadTwitchTrackerAnalytics(): Promise<TwitchTrackerAnalytics> {
  const [latest, history, games] = await Promise.all([
    loadLatestChannels(),
    loadChannelHistory(),
    loadLatestGames(),
  ]);
  return { latest, history, games };
}

export async function loadMemberTwitchTrackerSummary(
  slug: string,
): Promise<TwitchTrackerChannelSnapshot | null> {
  const normalized = slug.trim();
  if (!normalized) return null;
  try {
    const result = await query<ChannelRow>(
      `SELECT member_slug, twitch_login, snapshot_date::text, window_days,
              rank, minutes_streamed, avg_viewers, max_viewers,
              hours_watched::text, followers_gained, followers_total::text,
              fetched_at::text
         FROM twitchtracker_channel_snapshots
        WHERE member_slug = $1
        ORDER BY snapshot_date DESC, fetched_at DESC
        LIMIT 1`,
      [normalized],
    );
    const row = result.rows[0];
    return row ? channelSnapshot(row) : null;
  } catch {
    return null;
  }
}
