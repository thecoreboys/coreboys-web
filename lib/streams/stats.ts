import "server-only";
import { query } from "@/lib/db";
import type { StreamSession } from "@/components/metrics/StreamStatsClient";
import type { MetricsRow } from "@/components/metrics/MetricsClient";
import type { ChatRow } from "@/components/metrics/ChatStatsClient";

async function safeQuery<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function loadMetricsSnapshots(): Promise<MetricsRow[]> {
  return safeQuery(async () => {
    const res = await query<{
      member_slug: string;
      platform: string;
      count: string;
      snapshot_date: string;
    }>(
      `SELECT member_slug, platform, count::text AS count, snapshot_date::text AS snapshot_date
       FROM metric_snapshots
       WHERE NOT starts_with(member_slug, '__crew__:')
       ORDER BY snapshot_date ASC`,
    );
    return res.rows.map((r) => ({
      slug: r.member_slug,
      platform: r.platform,
      count: Number(r.count),
      date: r.snapshot_date,
    }));
  }, []);
}

export async function loadStreamHistory(): Promise<{
  sessions: StreamSession[];
}> {
  const sessions = await safeQuery(async () => {
    const res = await query<{
      id: string;
      member_slug: string;
      started_at: string;
      ended_at: string | null;
      total_minutes: number;
      peak_viewers: number;
      sum_viewers: string;
      sample_count: number;
      title: string | null;
      game: string | null;
    }>(
      `SELECT id::text, member_slug,
              started_at::text, ended_at::text,
              total_minutes, peak_viewers,
              sum_viewers::text, sample_count,
              title, game
       FROM stream_sessions
       WHERE started_at >= NOW() - INTERVAL '400 days'
       ORDER BY started_at DESC`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      slug: r.member_slug,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      totalMinutes: r.total_minutes,
      peakViewers: r.peak_viewers,
      avgViewers: r.sample_count > 0 ? Math.round(Number(r.sum_viewers) / r.sample_count) : 0,
      title: r.title,
      game: r.game,
    }));
  }, [] as StreamSession[]);

  return { sessions };
}

export async function loadChatHistory(): Promise<ChatRow[]> {
  return safeQuery(async () => {
    const res = await query<{
      member_slug: string;
      hour_utc: string;
      message_count: number;
      unique_chatters: number;
    }>(
      `SELECT member_slug, hour_utc::text, message_count, unique_chatters
       FROM chat_metrics
       WHERE hour_utc >= NOW() - INTERVAL '31 days'
       ORDER BY hour_utc ASC`,
    );
    return res.rows.map((r) => ({
      slug: r.member_slug,
      hour: r.hour_utc,
      messages: r.message_count,
      chatters: r.unique_chatters,
    }));
  }, []);
}
