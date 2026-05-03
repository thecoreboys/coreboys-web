import type { Metadata } from "next";
import { MEMBERS } from "@/lib/members";
import { query } from "@/lib/db";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { MetricsClient, type MetricsRow } from "@/components/metrics/MetricsClient";
import {
  StreamStatsClient,
  type DailyAirtime,
  type StreamSession,
} from "@/components/metrics/StreamStatsClient";
import { ChatStatsClient, type ChatRow } from "@/components/metrics/ChatStatsClient";

export const metadata: Metadata = {
  title: "Metrics",
  description:
    "Live and historical follower growth across every CORE platform — group totals, Twitch combined, and per-day deltas going back a year.",
  alternates: { canonical: "/metrics" },
};

// Fresh on every request — the table is small and we want toggles to
// reflect the latest snapshot the cron has written.
export const dynamic = "force-dynamic";

type DbRow = {
  member_slug: string;
  platform: string;
  count: string;
  snapshot_date: string;
};

type SessionDbRow = {
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
};

type DailyAirtimeDbRow = {
  member_slug: string;
  day: string;
  minutes: string;
  sessions: string;
  peak_viewers: string;
};

type ChatDbRow = {
  member_slug: string;
  hour_utc: string;
  message_count: number;
  unique_chatters: number;
};

export default async function MetricsPage() {
  let rows: MetricsRow[] = [];
  let sessions: StreamSession[] = [];
  let daily: DailyAirtime[] = [];
  let chat: ChatRow[] = [];
  let dbError: string | null = null;

  try {
    const [snapshots, sessionRes, dailyRes, chatRes] = await Promise.all([
      query<DbRow>(
        `SELECT member_slug, platform, count::text AS count, snapshot_date::text AS snapshot_date
         FROM metric_snapshots
         ORDER BY snapshot_date ASC`,
      ),
      query<SessionDbRow>(
        `SELECT id::text, member_slug,
                started_at::text, ended_at::text,
                total_minutes, peak_viewers,
                sum_viewers::text, sample_count,
                title, game
         FROM stream_sessions
         WHERE started_at >= NOW() - INTERVAL '365 days'
         ORDER BY started_at DESC`,
      ),
      query<DailyAirtimeDbRow>(
        // Bucket by Pacific calendar day so streak / consistency visuals
        // line up with how a viewer thinks about "did they stream today".
        `SELECT member_slug,
                DATE(started_at AT TIME ZONE 'America/Los_Angeles')::text AS day,
                SUM(total_minutes)::text AS minutes,
                COUNT(*)::text AS sessions,
                MAX(peak_viewers)::text AS peak_viewers
         FROM stream_sessions
         WHERE started_at >= NOW() - INTERVAL '400 days'
         GROUP BY member_slug, DATE(started_at AT TIME ZONE 'America/Los_Angeles')
         ORDER BY day ASC`,
      ),
      query<ChatDbRow>(
        `SELECT member_slug, hour_utc::text, message_count, unique_chatters
         FROM chat_metrics
         WHERE hour_utc >= NOW() - INTERVAL '31 days'
         ORDER BY hour_utc ASC`,
      ),
    ]);

    rows = snapshots.rows.map((r) => ({
      slug: r.member_slug,
      platform: r.platform,
      count: Number(r.count),
      date: r.snapshot_date,
    }));

    sessions = sessionRes.rows.map((r) => ({
      id: r.id,
      slug: r.member_slug,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      totalMinutes: r.total_minutes,
      peakViewers: r.peak_viewers,
      avgViewers:
        r.sample_count > 0 ? Math.round(Number(r.sum_viewers) / r.sample_count) : 0,
      title: r.title,
      game: r.game,
    }));

    daily = dailyRes.rows.map((r) => ({
      slug: r.member_slug,
      date: r.day,
      minutes: Number(r.minutes),
      sessions: Number(r.sessions),
      peakViewers: Number(r.peak_viewers),
    }));

    chat = chatRes.rows.map((r) => ({
      slug: r.member_slug,
      hour: r.hour_utc,
      messages: r.message_count,
      chatters: r.unique_chatters,
    }));
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const members = MEMBERS.map((m) => ({
    slug: m.slug,
    name: m.stageName,
    accent: m.accent,
    portrait: m.portrait,
    twitchLogin: m.twitchLogin,
  }));

  return (
    <main className="relative pt-20 md:pt-24">
      <section className="border-b border-[color:var(--rule)] bg-dot-grid">
        <div className="mx-auto max-w-[1440px] px-6 py-12 md:px-8 md:py-16">
          <p className="eyebrow">Metrics · Public dashboard</p>
          <h1 className="mt-2 text-display text-[clamp(36px,5vw,64px)] font-black tracking-[-0.04em] text-[color:var(--ink)]">
            Metrics &amp; Analytics
          </h1>
        </div>
      </section>

      <section className="border-b border-[color:var(--rule)] bg-[color:var(--bg)]">
        <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
          {dbError ? (
            <div className="rounded-lg border border-[color:var(--core)]/40 bg-[color:var(--core)]/10 p-4 text-[13px] text-[color:var(--ink)]">
              <strong className="font-semibold">Database not reachable.</strong>{" "}
              Snapshots can&apos;t load right now. Most likely DATABASE_URL isn&apos;t set
              in the runtime, or the metric_snapshots table hasn&apos;t been
              migrated yet. <span className="font-mono">{dbError}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              <MetricsClient rows={rows} members={members} />
              <hr className="border-[color:var(--rule)]" />
              <StreamStatsClient
                sessions={sessions}
                daily={daily}
                members={members}
              />
              <hr className="border-[color:var(--rule)]" />
              <ChatStatsClient chat={chat} members={members} />
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
