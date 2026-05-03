"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Flame } from "lucide-react";
import { HeatmapYear, type HeatmapDay } from "@/components/metrics/HeatmapYear";

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
  /** YYYY-MM-DD (already bucketed in PST by the server query) */
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
};

export type StreamStatsClientProps = {
  sessions: StreamSession[];
  daily: DailyAirtime[];
  members: MemberLite[];
};

type Range = "1d" | "7d" | "31d" | "all";

export function StreamStatsClient({ sessions, daily, members }: StreamStatsClientProps) {
  const [range, setRange] = useState<Range>("31d");

  const cutoff = useMemo(() => {
    if (range === "all") return null;
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    const c = new Date();
    c.setDate(c.getDate() - days);
    return c.toISOString();
  }, [range]);

  const ranged = useMemo(
    () => (cutoff ? sessions.filter((s) => s.startedAt >= cutoff) : sessions),
    [sessions, cutoff],
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

  const dailyByMember = useMemo(() => {
    const map = new Map<string, Map<string, HeatmapDay>>();
    for (const m of members) map.set(m.slug, new Map());
    for (const d of daily) {
      const m = map.get(d.slug);
      if (!m) continue;
      m.set(d.date, { date: d.date, value: d.minutes });
    }
    return map;
  }, [members, daily]);

  // Streaks (PST, since `daily.date` is already bucketed in PST server-side).
  const streaksBySlug = useMemo(() => {
    const out = new Map<string, { current: number; longest: number; lastDate: string | null }>();
    for (const m of members) {
      const days = new Set(daily.filter((d) => d.slug === m.slug && d.minutes > 0).map((d) => d.date));
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
      let cursor = pstToday();
      // If today isn't in the set, allow yesterday as the latest.
      if (!days.has(cursor)) cursor = pstYesterday();
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
  }, [members, daily]);

  const recentSessions = useMemo(
    () => [...ranged].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 14),
    [ranged],
  );

  const empty = sessions.length === 0;
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-8">
      {/* Range toggle + section header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Twitch · Stream stats
          </p>
          <h2 className="mt-1 text-[20px] font-bold tracking-tight text-[color:var(--ink)] md:text-[26px]">
            Live time, peak watchers, daily streaks.
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["1d", "7d", "31d", "all"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
                range === r
                  ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
                  : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
              }`}
            >
              {r === "all" ? "All time" : r === "1d" ? "24h" : r === "7d" ? "7d" : "31d"}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <div className="rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/60 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            No sessions recorded yet
          </p>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
            The Twitch poller hasn&apos;t observed a live session yet. Once
            the 5-minute cron runs while a member is streaming, every
            section below populates automatically.
          </p>
        </div>
      ) : null}

      {/* Combined KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Peak viewers · combined" value={combined.peak.toLocaleString("en-US")} />
        <KpiCard label="Average viewers · combined" value={combined.avg.toLocaleString("en-US")} />
        <KpiCard label="Hours watched · combined" value={combined.hoursWatched.toLocaleString("en-US")} />
        <KpiCard label="Airtime · combined" value={formatMinutes(combined.airtimeMinutes)} />
      </section>

      {/* Per-member tile grid — image-rich, click-through to /m/[slug]. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {perMember.map((m) => {
          const streak = streaksBySlug.get(m.slug);
          return (
            <Link
              key={m.slug}
              href={`/m/${m.slug}` as `/m/${string}`}
              className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-3 transition-all hover:-translate-y-px hover:border-[color:var(--rule-strong)]"
              style={{ ["--card-accent" as string]: m.accent }}
            >
              <div
                className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-inset"
                style={{ ["--tw-ring-color" as string]: `${m.accent}55` }}
              >
                <Image
                  src={m.portrait}
                  alt={m.name}
                  fill
                  unoptimized
                  sizes="80px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="truncate text-[14px] font-bold tracking-tight"
                    style={{ color: m.accent }}
                  >
                    {m.name}
                  </p>
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
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-[color:var(--ink-dim)]">
                  <Datum label="Peak" value={m.peak.toLocaleString("en-US")} />
                  <Datum label="Avg" value={m.avg.toLocaleString("en-US")} />
                  <Datum label="Hrs" value={m.hoursWatched.toLocaleString("en-US")} />
                  <Datum label="Airtime" value={formatMinutes(m.airtimeMinutes)} />
                </dl>
                {streak ? (
                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--core)]/12 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--core)]">
                      <Flame size={10} />
                      {streak.current}d streak
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--ink-faint)]">
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
      <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
              Consistency · {currentYear} (PST)
            </p>
            <h3 className="mt-1 text-[16px] font-bold tracking-tight text-[color:var(--ink)] md:text-[20px]">
              One square per day. Brighter = longer session.
            </h3>
          </div>
          <p className="font-mono text-[10px] text-[color:var(--ink-faint)]">
            Hover for date + minutes streamed
          </p>
        </header>
        <div className="flex flex-col gap-5">
          {members.map((m) => {
            const streak = streaksBySlug.get(m.slug);
            return (
              <div key={m.slug} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/m/${m.slug}` as `/m/${string}`}
                    className="group inline-flex items-center gap-2"
                  >
                    <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-inset"
                      style={{ ["--tw-ring-color" as string]: `${m.accent}66` }}
                    >
                      <Image src={m.portrait} alt={m.name} fill unoptimized sizes="28px" className="object-cover" />
                    </span>
                    <span
                      className="text-[13px] font-semibold tracking-tight transition-colors group-hover:underline"
                      style={{ color: m.accent }}
                    >
                      {m.name}
                    </span>
                  </Link>
                  {streak ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
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
          })}
        </div>
      </section>

      {/* Recent sessions timeline */}
      <section className="overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]">
        <header className="border-b border-[color:var(--rule)] px-4 py-3 md:px-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Recent sessions · last {recentSessions.length} streams in range
          </p>
        </header>
        {recentSessions.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-[color:var(--ink-dim)]">
            No streams in this window.
          </div>
        ) : (
          <ul>
            {recentSessions.map((s) => {
              const member = members.find((m) => m.slug === s.slug);
              const ended = s.endedAt ? new Date(s.endedAt) : null;
              const isLive = ended === null;
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 border-t border-[color:var(--rule)] px-4 py-3 first:border-t-0"
                >
                  {member ? (
                    <Link
                      href={`/m/${member.slug}` as `/m/${string}`}
                      className="inline-flex items-center gap-2"
                    >
                      <span
                        className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-2 ring-inset"
                        style={{ ["--tw-ring-color" as string]: `${member.accent}66` }}
                      >
                        <Image
                          src={member.portrait}
                          alt={member.name}
                          fill
                          unoptimized
                          sizes="28px"
                          className="object-cover"
                        />
                      </span>
                      <span
                        className="text-[13px] font-bold tracking-tight"
                        style={{ color: member.accent }}
                      >
                        {member.name}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-[13px] font-bold text-[color:var(--ink)]">{s.slug}</span>
                  )}
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em]">
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        background: isLive ? "var(--core)" : "var(--ink-faint)",
                        animation: isLive ? "live-blink 1s ease-in-out infinite" : undefined,
                      }}
                    />
                    <span className={isLive ? "text-[color:var(--core)]" : "text-[color:var(--ink-dim)]"}>
                      {isLive ? "Live now" : "Ended"}
                    </span>
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-[color:var(--ink-dim)]">
                    <span>
                      {new Date(s.startedAt).toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {ended
                        ? ` → ${ended.toLocaleString("en-US", {
                            timeZone: "America/Los_Angeles",
                            hour: "numeric",
                            minute: "2-digit",
                          })}`
                        : " · live"}
                    </span>
                    <span>·</span>
                    <span>{formatMinutes(s.totalMinutes)}</span>
                    <span>·</span>
                    <span>peak {s.peakViewers.toLocaleString("en-US")}</span>
                    <span>·</span>
                    <span>avg {s.avgViewers.toLocaleString("en-US")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        {label}
      </p>
      <p className="mt-2 text-[24px] font-bold tabular-nums leading-none text-[color:var(--ink)]">
        {value}
      </p>
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

// Date helpers — daily.date is already in PST (server-side cast). To
// avoid timezone drift on the browser, we work with raw YYYY-MM-DD
// strings instead of `Date` arithmetic.
function pstToday(): string {
  const now = new Date();
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
}
function pstYesterday(): string {
  return previousDay(pstToday());
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
