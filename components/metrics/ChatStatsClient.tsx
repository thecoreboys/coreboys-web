"use client";

import { useMemo, useState } from "react";
import { TrendLine, type TrendPoint } from "@/components/metrics/TrendLine";

export type ChatRow = {
  slug: string;
  /** ISO timestamp truncated to the hour, UTC. */
  hour: string;
  messages: number;
  chatters: number;
};

export type ChatStatsClientProps = {
  chat: ChatRow[];
  members: Array<{ slug: string; name: string; accent: string }>;
};

type Range = "1d" | "7d" | "31d";

export function ChatStatsClient({ chat, members }: ChatStatsClientProps) {
  const [range, setRange] = useState<Range>("7d");

  const cutoff = useMemo(() => {
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    const c = new Date();
    c.setDate(c.getDate() - days);
    return c.toISOString();
  }, [range]);

  const ranged = useMemo(() => chat.filter((r) => r.hour >= cutoff), [chat, cutoff]);

  const totals = useMemo(() => {
    const perMember = new Map<string, { messages: number; chatters: Set<string> }>();
    for (const m of members) perMember.set(m.slug, { messages: 0, chatters: new Set() });
    let totalMessages = 0;
    let maxUniqueAcrossHours = 0;
    for (const r of ranged) {
      const e = perMember.get(r.slug);
      if (!e) continue;
      e.messages += r.messages;
      // We only know per-(slug, hour) unique counts — true cross-hour
      // dedupe would need raw chatter usernames. Best approximation: max
      // per-hour count is a lower bound on the period's unique chatters
      // for that slug.
      e.chatters.add(`${r.slug}::${r.hour}`); // placeholder; we use per-hour max below
      totalMessages += r.messages;
      maxUniqueAcrossHours = Math.max(maxUniqueAcrossHours, r.chatters);
    }
    return {
      totalMessages,
      perMember: members.map((m) => {
        const e = perMember.get(m.slug)!;
        // For per-member peak, find the row's own max chatters in window.
        const peakChatters = ranged
          .filter((r) => r.slug === m.slug)
          .reduce((max, r) => Math.max(max, r.chatters), 0);
        return { ...m, messages: e.messages, peakChatters };
      }),
      // Combined message count across all members in the window.
      maxConcurrentChatters: maxUniqueAcrossHours,
    };
  }, [ranged, members]);

  // Combined trend: sum messages per hour bucket across all members.
  const combinedTrend: TrendPoint[] = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const r of ranged) {
      bucket.set(r.hour, (bucket.get(r.hour) ?? 0) + r.messages);
    }
    return [...bucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, value]) => ({ date: hour.slice(0, 16), value }));
  }, [ranged]);

  const empty = chat.length === 0;
  const accent = "#ef4444";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Twitch · Chat activity
          </p>
          <h2 className="mt-1 text-[20px] font-bold tracking-tight text-[color:var(--ink)] md:text-[26px]">
            Messages + unique chatters per hour.
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["1d", "7d", "31d"] as Range[]).map((r) => (
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
              {r === "1d" ? "24h" : r === "7d" ? "7d" : "31d"}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <div className="rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/60 p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Listener live
          </p>
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-[color:var(--ink-dim)]">
            Chat worker is connected to all six channels and counting every
            message in real time. Hourly buckets show up here as members
            stream — refresh after someone goes live.
          </p>
        </div>
      ) : (
        <>
          <section>
            <KpiCard
              label="Total messages"
              value={totals.totalMessages.toLocaleString("en-US")}
              sub={`${ranged.length} hour bucket${ranged.length === 1 ? "" : "s"}`}
            />
          </section>

          <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
            <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                  Combined trend
                </p>
                <h3 className="mt-1 text-[16px] font-bold tracking-tight text-[color:var(--ink)] md:text-[20px]">
                  Messages per hour, all channels
                </h3>
              </div>
            </header>
            <TrendLine data={combinedTrend} accent={accent} unit="msgs" />
          </section>

          <section className="overflow-hidden rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)]">
            <header className="border-b border-[color:var(--rule)] px-4 py-3 md:px-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
                Per-member · {range === "1d" ? "last 24h" : `last ${range}`}
              </p>
            </header>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[color:var(--surface)] text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                  <th className="px-4 py-2 font-mono">Member</th>
                  <th className="px-4 py-2 font-mono">Trend</th>
                  <th className="px-4 py-2 text-right font-mono">Messages</th>
                </tr>
              </thead>
              <tbody>
                {totals.perMember.map((m) => (
                  <tr key={m.slug} className="border-t border-[color:var(--rule)]">
                    <td className="px-4 py-2.5 text-[13px] font-semibold text-[color:var(--ink)]">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: m.accent }} />
                        {m.name}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Sparkline
                        points={ranged.filter((r) => r.slug === m.slug).map((r) => r.messages)}
                        accent={m.accent}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-[color:var(--ink)]">
                      {m.messages.toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        {label}
      </p>
      <p className="mt-2 text-[24px] font-bold tabular-nums leading-none text-[color:var(--ink)]">
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        {sub}
      </p>
    </div>
  );
}

/** Tiny inline sparkline. Renders a thin line chart of `points` filling
 *  the available width. Useful for table cells where a full TrendLine
 *  would be too tall. */
function Sparkline({ points, accent }: { points: number[]; accent: string }) {
  if (points.length === 0) {
    return <span className="font-mono text-[10px] text-[color:var(--ink-faint)]">—</span>;
  }
  if (points.length === 1) {
    return (
      <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-dim)]">
        {points[0]!.toLocaleString("en-US")}
      </span>
    );
  }
  const W = 120;
  const H = 24;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const x = (i: number) => (W * i) / (points.length - 1);
  const y = (v: number) => H - ((v - min) / range) * (H - 2) - 1;
  const path = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block">
      <path d={path} fill="none" stroke={accent} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
