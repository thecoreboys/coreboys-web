import { NextResponse } from "next/server";
import { MEMBERS } from "@/lib/members";
import { query } from "@/lib/db";
import { refreshAirtimeDailyArchive } from "@/lib/watch/airtime-archive";
import {
  TWITCHTRACKER_WINDOW_DAYS,
  fetchTwitchTrackerChannelSummary,
  fetchTwitchTrackerGameSummary,
  type TwitchTrackerChannelSummary,
  type TwitchTrackerGameSummary,
} from "@/lib/twitchtracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_CONCURRENCY = 3;
const MAX_GAME_LOOKUPS = 20;

type ChannelSuccess = {
  kind: "success";
  memberSlug: string;
  twitchLogin: string;
  summary: TwitchTrackerChannelSummary;
  fetchedAt: string;
};

type ChannelOutcome =
  | ChannelSuccess
  | { kind: "unavailable"; memberSlug: string; twitchLogin: string }
  | { kind: "failed"; memberSlug: string; twitchLogin: string; error: string };

type RecentGame = { lookupKey: string; gameName: string };
type GameSuccess = RecentGame & {
  kind: "success";
  summary: TwitchTrackerGameSummary;
  fetchedAt: string;
};
type GameOutcome =
  | GameSuccess
  | (RecentGame & { kind: "unavailable" })
  | (RecentGame & { kind: "failed"; error: string });

function safeError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 240);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index];
      if (value === undefined) continue;
      output[index] = await worker(value);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, () => run()),
  );
  return output;
}

async function loadRecentGames(): Promise<RecentGame[]> {
  try {
    const result = await query<{
      lookup_key: string;
      game_name: string;
    }>(
      `SELECT lower(btrim(game)) AS lookup_key,
              max(btrim(game)) AS game_name
         FROM stream_sessions
        WHERE game IS NOT NULL
          AND btrim(game) <> ''
          AND started_at >= NOW() - INTERVAL '31 days'
        GROUP BY lower(btrim(game))
        ORDER BY max(started_at) DESC
        LIMIT $1`,
      [MAX_GAME_LOOKUPS],
    );
    return result.rows.map((row) => ({
      lookupKey: row.lookup_key,
      gameName: row.game_name,
    }));
  } catch {
    // Category enrichment is optional and must never prevent channel writes.
    return [];
  }
}

async function writeChannelSnapshots(rows: ChannelSuccess[], snapshotDate: string): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples = rows.map((row, index) => {
    const offset = index * 13;
    values.push(
      row.memberSlug,
      row.twitchLogin,
      snapshotDate,
      TWITCHTRACKER_WINDOW_DAYS,
      row.summary.rank,
      row.summary.minutesStreamed,
      row.summary.avgViewers,
      row.summary.maxViewers,
      row.summary.hoursWatched,
      row.summary.followersGained,
      row.summary.followersTotal,
      row.fetchedAt,
      row.summary.rawPayload,
    );
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13}::jsonb)`;
  });
  await query(
    `INSERT INTO twitchtracker_channel_snapshots
       (member_slug, twitch_login, snapshot_date, window_days, rank,
        minutes_streamed, avg_viewers, max_viewers, hours_watched,
        followers_gained, followers_total, fetched_at, raw_payload)
     VALUES ${tuples.join(",")}
     ON CONFLICT (twitch_login, snapshot_date)
     DO UPDATE SET
       member_slug = EXCLUDED.member_slug,
       window_days = EXCLUDED.window_days,
       rank = EXCLUDED.rank,
       minutes_streamed = EXCLUDED.minutes_streamed,
       avg_viewers = EXCLUDED.avg_viewers,
       max_viewers = EXCLUDED.max_viewers,
       hours_watched = EXCLUDED.hours_watched,
       followers_gained = EXCLUDED.followers_gained,
       followers_total = EXCLUDED.followers_total,
       fetched_at = EXCLUDED.fetched_at,
       raw_payload = EXCLUDED.raw_payload`,
    values,
  );
}

async function writeGameSnapshots(rows: GameSuccess[], snapshotDate: string): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples = rows.map((row, index) => {
    const offset = index * 10;
    values.push(
      row.lookupKey,
      row.gameName,
      snapshotDate,
      TWITCHTRACKER_WINDOW_DAYS,
      row.summary.rank,
      row.summary.avgViewers,
      row.summary.avgChannels,
      row.summary.hoursWatched,
      row.fetchedAt,
      row.summary.rawPayload,
    );
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10}::jsonb)`;
  });
  await query(
    `INSERT INTO twitchtracker_game_snapshots
       (lookup_key, game_name, snapshot_date, window_days, rank,
        avg_viewers, avg_channels, hours_watched, fetched_at, raw_payload)
     VALUES ${tuples.join(",")}
     ON CONFLICT (lookup_key, snapshot_date)
     DO UPDATE SET
       game_name = EXCLUDED.game_name,
       window_days = EXCLUDED.window_days,
       rank = EXCLUDED.rank,
       avg_viewers = EXCLUDED.avg_viewers,
       avg_channels = EXCLUDED.avg_channels,
       hours_watched = EXCLUDED.hours_watched,
       fetched_at = EXCLUDED.fetched_at,
       raw_payload = EXCLUDED.raw_payload`,
    values,
  );
}

export async function POST(request: Request) {
  const secret = process.env.METRICS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "METRICS_CRON_SECRET not configured" }, { status: 500 });
  }
  if ((request.headers.get("x-cron-secret") ?? "").trim() !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const recentGamesPromise = loadRecentGames();
  const channelOutcomes = await mapWithConcurrency(MEMBERS, FETCH_CONCURRENCY, async (member): Promise<ChannelOutcome> => {
    try {
      const summary = await fetchTwitchTrackerChannelSummary(member.twitchLogin);
      if (!summary) {
        return {
          kind: "unavailable",
          memberSlug: member.slug,
          twitchLogin: member.twitchLogin.toLowerCase(),
        };
      }
      return {
        kind: "success",
        memberSlug: member.slug,
        twitchLogin: member.twitchLogin.toLowerCase(),
        summary,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        kind: "failed",
        memberSlug: member.slug,
        twitchLogin: member.twitchLogin.toLowerCase(),
        error: safeError(error),
      };
    }
  });

  const recentGames = await recentGamesPromise;
  const gameOutcomes = await mapWithConcurrency(recentGames, FETCH_CONCURRENCY, async (game): Promise<GameOutcome> => {
    try {
      const summary = await fetchTwitchTrackerGameSummary(game.gameName);
      if (!summary) return { kind: "unavailable", ...game };
      return {
        kind: "success",
        ...game,
        summary,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      return { kind: "failed", ...game, error: safeError(error) };
    }
  });

  const channelSuccesses = channelOutcomes.filter(
    (outcome): outcome is ChannelSuccess => outcome.kind === "success",
  );
  const gameSuccesses = gameOutcomes.filter(
    (outcome): outcome is GameSuccess => outcome.kind === "success",
  );

  let airtimeArchive = null;
  try {
    const [, , archiveResult] = await Promise.all([
      writeChannelSnapshots(channelSuccesses, snapshotDate),
      writeGameSnapshots(gameSuccesses, snapshotDate),
      // The day archive is intentionally best-effort. This daily collector
      // gives it a guaranteed backfill cadence even when nobody opens Watch.
      refreshAirtimeDailyArchive({ force: true }),
    ]);
    airtimeArchive = archiveResult;
  } catch (error) {
    return NextResponse.json(
      { error: "snapshot_write_failed", detail: safeError(error) },
      { status: 500 },
    );
  }

  const failedChannels = channelOutcomes.filter((outcome) => outcome.kind === "failed");
  const failedGames = gameOutcomes.filter((outcome) => outcome.kind === "failed");
  const unavailableChannels = channelOutcomes.filter((outcome) => outcome.kind === "unavailable");
  const unavailableGames = gameOutcomes.filter((outcome) => outcome.kind === "unavailable");

  return NextResponse.json(
    {
      ok: channelSuccesses.length > 0,
      source: {
        provider: "TwitchTracker",
        windowDays: TWITCHTRACKER_WINDOW_DAYS,
        categoryScope: "twitch-wide",
      },
      snapshotDate,
      airtimeArchive,
      channels: {
        requested: channelOutcomes.length,
        written: channelSuccesses.length,
        unavailable: unavailableChannels.length,
        failed: failedChannels,
      },
      games: {
        requested: gameOutcomes.length,
        written: gameSuccesses.length,
        unavailable: unavailableGames.length,
        failed: failedGames,
      },
    },
    { status: channelSuccesses.length > 0 ? 200 : 502 },
  );
}
