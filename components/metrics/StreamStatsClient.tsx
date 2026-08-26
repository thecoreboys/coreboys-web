"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Flame } from "lucide-react";
import { Signal01, Users01, Clock, Eye } from "@untitledui/icons";
import { HeatmapYear, type HeatmapDay } from "@/components/metrics/HeatmapYear";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeToggle } from "@/components/metrics/RangeToggle";
import { useBrowserTimeZone } from "@/hooks/useBrowserTimeZone";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { useNow } from "@/hooks/useNow";
import { networkLabel } from "@/lib/members-helpers";
import { SessionStamp } from "@/components/watch/LiveAirtime";

export type StreamSession = {
  id: string;
  slug: string;
  startedAt: string;
  endedAt: string | null;
  totalMinutes: number;
  peakViewers: number;
  avgViewers: number;
  title: string | null;
  game: string | null;
};

export type DailyAirtime = {
  slug: string;
  /** Plain calendar date (`YYYY-MM-DD`). */
  date: string;
  minutes: number;
  sessions: number;
  peakViewers: number;
};

export type MemberLite = {
  slug: string;
  name: string;
  accent: string;
  portrait: string;
  twitchLogin: string;
  commName?: string;
  commLogo?: string;
};

export type StreamStatsClientProps = {
  sessions: StreamSession[];
  members: MemberLite[];
};

type Range = "1d" | "7d" | "31d" | "all";

export function StreamStatsClient({ sessions, members }: StreamStatsClientProps) {
  const [range, setRange] = useState<Range>("31d");
  const viewer = useBrowserTimeZone();
  const now = useNow(60_000);

  // Live viewer counts — used for the per-member tile "LIVE" badge.
  // SWR refreshes every 60s.
  const { data: liveData } = useLiveStatus();
  const liveByLogin = useMemo(() => {
    const map = new Map<string, { isLive: boolean; viewerCount: number | null }>();
    for (const e of liveData?.live ?? []) {
      map.set(e.login.toLowerCase(), { isLive: e.isLive, viewerCount: e.viewerCount ?? null });
    }
    return map;
  }, [liveData]);

  const cutoffMs = useMemo(() => {
    if (range === "all") return null;
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    return Date.now() - days * 86_400_000;
  }, [range]);

  // PG ::text shape is "2026-05-02 18:00:00+00", JS toISOString uses T.
  // Compare via parsed ms so we don't drop the cutoff-day rows.
  const ranged = useMemo(
    () =>
      cutoffMs == null
        ? sessions
        : sessions.filter((s) => Date.parse(s.startedAt.replace(" ", "T")) >= cutoffMs),
    [sessions, cutoffMs],
  );

  const perMember = useMemo(() => {
    type Agg = { peak: number; avgSum: number; avgCount: number; minutes: number; hoursWatched: number };
    const map = new Map<string, Agg>();
    for (const m of members) map.set(m.slug, { peak: 0, avgSum: 0, avgCount: 0, minutes: 0, hoursWatched: 0 });
    for (const s of ranged) {
      const row = map.get(s.slug);
      if (!row) continue;
      row.peak = Math.max(row.peak, s.peakViewers);
      if (s.avgViewers > 0) {
        row.avgSum += s.avgViewers * s.totalMinutes;
        row.avgCount += s.totalMinutes;
      }
      row.minutes += s.totalMinutes;
      row.hoursWatched += (s.avgViewers * s.totalMinutes) / 60;
    }
    return members.map((m) => {
      const r = map.get(m.slug)!;
      return {
        ...m,
        peak: r.peak,
        avg: r.avgCount > 0 ? Math.round(r.avgSum / r.avgCount) : 0,
        airtimeMinutes: r.minutes,
        hoursWatched: Math.round(r.hoursWatched),
      };
    });
  }, [members, ranged]);

  const combined = useMemo(() => {
    let peak = 0;
    let airtime = 0;
    let hours = 0;
    let avgSum = 0;
    let avgCount = 0;
    for (const r of perMember) {
      peak = Math.max(peak, r.peak);
      airtime += r.airtimeMinutes;
      hours += r.hoursWatched;
      avgSum += r.avg * r.airtimeMinutes;
      avgCount += r.airtimeMinutes;
    }
    return {
      peak,
      airtimeMinutes: airtime,
      hoursWatched: Math.round(hours),
      avg: avgCount > 0 ? Math.round(avgSum / avgCount) : 0,
    };
  }, [perMember]);

  // The server's legacy daily rollup has a fixed house timezone. Rebuild the
  // visible calendar from raw session instants so every viewer gets the same
  // sessions assigned to dates in their own browser timezone.
  const viewerDaily = useMemo(
    () => viewer.ready ? bucketSessionsByDate(sessions, viewer.timeZone) : [],
    [sessions, viewer.ready, viewer.timeZone],
  );
  const viewerToday = useMemo(
    () => viewer.ready ? dateKeyInTimeZone(now, viewer.timeZone) : null,
    [now, viewer.ready, viewer.timeZone],
  );

  const dailyByMember = useMemo(() => {
    const map = new Map<string, Map<string, HeatmapDay>>();
    for (const m of members) map.set(m.slug, new Map());
    for (const d of viewerDaily) {
      const inner = map.get(d.slug);
      if (!inner) continue;
      const memberName = members.find((mm) => mm.slug === d.slug)?.name ?? d.slug;
      const liveMsg =
        d.minutes > 0
          ? `${memberName} went live`
          : `${memberName} did not stream`;
      const stats: Array<{ label: string; value: string }> =
        d.minutes > 0
          ? [
              { label: "Airtime", value: formatMinutes(d.minutes) },
              { label: "Streams", value: d.sessions.toLocaleString("en-US") },
              { label: "Peak", value: d.peakViewers.toLocaleString("en-US") },
            ]
          : [];
      inner.set(d.date, {
        date: d.date,
        value: d.minutes,
        hover: liveMsg,
        stats,
      });
    }
    return map;
  }, [members, viewerDaily]);

  // Streaks use the viewer's calendar days, including their local "today."
  const streaksBySlug = useMemo(() => {
    const out = new Map<string, { current: number; longest: number; lastDate: string | null }>();
    if (!viewerToday) return out;
    for (const m of members) {
      const days = new Set(viewerDaily.filter((d) => d.slug === m.slug && d.minutes > 0).map((d) => d.date));
      // Longest run
      let longest = 0;
      let run = 0;
      const sorted = [...days].sort();
      let prev: string | null = null;
      for (const d of sorted) {
        if (prev && isNextDay(prev, d)) run += 1;
        else run = 1;
        if (run > longest) longest = run;
        prev = d;
      }
      // Current streak — count back from today (or yesterday if today
      // hasn't accrued any minutes yet, so the streak doesn't break
      // mid-stream of "they haven't gone live yet today").
      let current = 0;
      let cursor = viewerToday;
      // If today isn't in the set, allow yesterday as the latest.
      if (!days.has(cursor)) cursor = previousDay(viewerToday);
      while (days.has(cursor)) {
        current += 1;
        cursor = previousDay(cursor);
      }
      out.set(m.slug, {
        current,
        longest,
        lastDate: sorted.length > 0 ? sorted[sorted.length - 1]! : null,
      });
    }
    return out;
  }, [members, viewerDaily, viewerToday]);

  const empty = sessions.length === 0;
  const currentYear = viewerToday ? Number(viewerToday.slice(0, 4)) : new Date(now).getUTCFullYear();
  const latestSession = (slug: string) => sessions.find((s) => s.slug === slug);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-secondary">
            Twitch · Observed stream history
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">
            <span className="gradient-text">Dated sessions</span>, streaks, and consistency.
          </h2>
        </div>
        <RangeToggle
          value={range}
          onChange={setRange}
          options={[
            { key: "1d", label: "24h" },
            { key: "7d", label: "7d" },
            { key: "31d", label: "31d" },
            { key: "all", label: "All time" },
          ]}
        />
      </header>

      {empty ? (
        <div className="rounded-xl bg-secondary p-6 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic">
          <p className="text-sm font-semibold text-brand-secondary">
            No sessions recorded yet
          </p>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-tertiary">
            Sessions write the moment someone is live on the site. Historical
            airtime fills in from there.
          </p>
        </div>
      ) : null}

      {/* Combined KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={Signal01} label="Highest observed peak" value={combined.peak.toLocaleString("en-US")} />
        <MetricCard icon={Users01} label="Observed weighted average" value={combined.avg.toLocaleString("en-US")} />
        <MetricCard icon={Eye} label="Estimated observed watchtime" value={combined.hoursWatched.toLocaleString("en-US")} />
        <MetricCard icon={Clock} label="Observed airtime" value={formatMinutes(combined.airtimeMinutes)} />
      </section>

      {/* Per-member tile grid — image-rich, click-through to /about/[slug]. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perMember.map((m) => {
          const streak = streaksBySlug.get(m.slug);
          const live = liveByLogin.get(m.twitchLogin.toLowerCase());
          const isLive = live?.isLive ?? false;
          const last = latestSession(m.slug);
          return (
            <Link
              key={m.slug}
              href={`/watch/network/${m.slug}` as never}
              className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3 transition-all hover:-translate-y-px hover:border-[color:var(--rule-strong)]"
              style={{ ["--card-accent" as string]: m.accent }}
            >
              <div
                className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset"
                style={{ ["--tw-ring-color" as string]: isLive ? "var(--core)" : `${m.accent}55` }}
              >
                <Image
                  src={m.portrait}
                  alt={m.name}
                  fill
                  unoptimized
                  sizes="96px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                />
                {isLive ? (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-md bg-[color:var(--core)] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-[0.1em] text-white shadow-[0_2px_6px_rgba(219,3,104,0.6)]">
                    <span
                      aria-hidden
                      className="h-1 w-1 rounded-full bg-white"
                      style={{ animation: "live-blink 1s ease-in-out infinite" }}
                    />
                    Live
                  </span>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold tracking-tight text-primary md:text-xl">
                      {m.commName ? networkLabel(m.commName) : m.name}
                    </p>
                    <p className="truncate text-[11px] text-tertiary">{m.name}</p>
                  </div>
                  <a
                    href={`https://twitch.tv/${m.twitchLogin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${m.name} on Twitch`}
                    className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--bg)] text-[color:var(--ink-dim)] transition-colors hover:border-[#9146FF] hover:text-[#9146FF]"
                  >
                    <ArrowUpRight size={11} />
                  </a>
                </div>
                <SessionStamp
                  live={isLive ? { startedAt: liveData?.live.find((e) => e.login.toLowerCase() === m.twitchLogin.toLowerCase())?.startedAt } : undefined}
                  session={
                    last
                      ? {
                          id: last.id,
                          slug: last.slug,
                          startedAt: last.startedAt,
                          endedAt: last.endedAt,
                          totalMinutes: last.totalMinutes,
                          peakViewers: last.peakViewers,
                          title: last.title,
                          game: last.game,
                        }
                      : null
                  }
                  className="text-[11px] tabular-nums text-tertiary"
                />
                {isLive && (live?.viewerCount ?? 0) > 0 ? (
                  <p className="-mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--core)]">
                    <span className="tabular-nums">{(live!.viewerCount ?? 0).toLocaleString("en-US")}</span>
                    <span className="font-normal text-tertiary">watching now</span>
                  </p>
                ) : null}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-tertiary">
                  <Datum label="Peak" value={m.peak.toLocaleString("en-US")} />
                  <Datum label="Avg" value={m.avg.toLocaleString("en-US")} />
                  <Datum label="Hrs" value={m.hoursWatched.toLocaleString("en-US")} />
                  <Datum label="Airtime" value={formatMinutes(m.airtimeMinutes)} />
                </dl>
                {streak ? (
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--core)]/12 px-2 py-0.5 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--core)]">
                      <Flame size={11} />
                      {streak.current}d streak
                    </span>
                    <span className="text-xs text-quaternary">
                      best · {streak.longest}d
                    </span>
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </section>

      {/* Per-member consistency grids — calendar year, Sun-Sat, hover details. */}
      <section className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic md:p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p
              className="text-sm font-semibold text-brand-secondary"
              title={viewer.ready ? `Dates use ${viewer.timeZone}` : undefined}
            >
              {viewer.ready ? `Consistency · ${currentYear}` : "Consistency · Your local calendar"}
            </p>
            <h3 className="mt-1 text-md font-semibold tracking-tight text-primary md:text-lg">
              One square per day.
            </h3>
          </div>
        </header>
        <div className="flex flex-col gap-5">
          {viewer.ready ? members.map((m) => {
            const streak = streaksBySlug.get(m.slug);
            return (
              <div key={m.slug} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/about/${m.slug}` as never}
                    className="group inline-flex items-center gap-2"
                  >
                    <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-inset"
                      style={{ ["--tw-ring-color" as string]: `${m.accent}66` }}
                    >
                      <Image src={m.portrait} alt={m.name} fill unoptimized sizes="28px" className="object-cover" />
                    </span>
                    <span
                      className="text-sm font-semibold tracking-tight text-primary transition-colors group-hover:underline"
                      style={{ textShadow: `0 0 14px ${m.accent}66, 0 0 3px rgba(255,255,255,0.4)` }}
                    >
                      {m.name}
                    </span>
                  </Link>
                  {streak ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.14em] text-tertiary">
                      <Flame size={11} className="text-[color:var(--core)]" />
                      {streak.current}d current · {streak.longest}d best
                    </span>
                  ) : null}
                </div>
                <HeatmapYear
                  byDate={dailyByMember.get(m.slug) ?? new Map()}
                  accent={m.accent}
                  colorBy="value"
                  year={currentYear}
                />
              </div>
            );
          }) : (
            <div className="h-32 animate-pulse rounded-lg bg-secondary" aria-label="Loading your local calendar" />
          )}
        </div>
      </section>

    </div>
  );
}

function Datum({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[color:var(--ink-faint)]">{label}</dt>
      <dd className="text-right tabular-nums text-[color:var(--ink)]">{value}</dd>
    </>
  );
}

function formatMinutes(total: number): string {
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `${d}d ${rh}h`;
}

function dateKeyInTimeZone(value: number, timeZone: string): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function bucketSessionsByDate(sessions: StreamSession[], timeZone: string): DailyAirtime[] {
  const buckets = new Map<string, DailyAirtime>();
  for (const session of sessions) {
    const startedAt = Date.parse(session.startedAt.replace(" ", "T"));
    if (!Number.isFinite(startedAt)) continue;
    const date = dateKeyInTimeZone(startedAt, timeZone);
    if (!date) continue;
    const key = `${session.slug}:${date}`;
    const current = buckets.get(key) ?? {
      slug: session.slug,
      date,
      minutes: 0,
      sessions: 0,
      peakViewers: 0,
    };
    current.minutes += Math.max(0, Number(session.totalMinutes) || 0);
    current.sessions += 1;
    current.peakViewers = Math.max(current.peakViewers, Math.max(0, Number(session.peakViewers) || 0));
    buckets.set(key, current);
  }
  return [...buckets.values()].sort((left, right) => (
    left.date.localeCompare(right.date) || left.slug.localeCompare(right.slug)
  ));
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function isNextDay(prev: string, curr: string): boolean {
  return previousDay(curr) === prev;
}
