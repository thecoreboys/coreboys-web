"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { HeatmapYear, type HeatmapDay } from "@/components/metrics/HeatmapYear";
import { TrendLine, type TrendPoint } from "@/components/metrics/TrendLine";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { useLiveStatus } from "@/hooks/useLiveStatus";
import { GROUP } from "@/lib/group";

export type MetricsRow = {
  slug: string;
  platform: string;
  count: number;
  date: string;
};

export type MetricsClientProps = {
  rows: MetricsRow[];
  members: Array<{ slug: string; name: string; accent: string; portrait: string; twitchLogin: string }>;
};

type Range = "1d" | "7d" | "31d" | "all";

/** Single-pill trend selector keys — one chart at a time. */
type Metric =
  | "twitch-combined"
  | "youtube-group"
  | "tiktok-group"
  | "instagram-group"
  | "x-group";

const METRICS: ReadonlyArray<{
  key: Metric;
  platform: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  brand: string;
  label: string;
  subtitle: string;
  unit: string;
}> = [
  { key: "twitch-combined", platform: "twitch",    brand: "#9146FF", label: "Twitch",    subtitle: "Members combined", unit: "followers" },
  { key: "youtube-group",   platform: "youtube",   brand: "#FF0033", label: "YouTube",   subtitle: GROUP.socials.youtube.handle,   unit: "subs" },
  { key: "tiktok-group",    platform: "tiktok",    brand: "#FE2C55", label: "TikTok",    subtitle: GROUP.socials.tiktok.handle,    unit: "followers" },
  { key: "instagram-group", platform: "instagram", brand: "#E1306C", label: "Instagram", subtitle: GROUP.socials.instagram.handle, unit: "followers" },
  { key: "x-group",         platform: "x",         brand: "#a1a1aa", label: "X",         subtitle: GROUP.socials.x.handle,         unit: "followers" },
];

const PLATFORM_COLOR: Record<string, string> = {
  twitch: "#9146FF",
  youtube: "#FF0033",
  tiktok: "#FE2C55",
  instagram: "#E1306C",
  x: "#a1a1aa",
};

export function MetricsClient({ rows, members }: MetricsClientProps) {
  const [range, setRange] = useState<Range>("31d");
  const [metricKey, setMetricKey] = useState<Metric>("twitch-combined");
  const metric = METRICS.find((m) => m.key === metricKey)!;

  // Live status — drives the "X live now · Y watching" header pill so
  // metrics page reflects the current stream state in real time.
  const { data: liveData } = useLiveStatus();
  const liveEntries = (liveData?.live ?? []).filter((l) => l.isLive);
  const liveCombinedViewers = liveEntries.reduce(
    (sum, e) => sum + (e.viewerCount ?? 0),
    0,
  );

  // Filter rows by range on the client. The /api/metrics endpoint can
  // also enforce range, but we always query "all" here so the toggle is
  // instant — no extra round-trip per click.
  const cutoff = useMemo(() => {
    if (range === "all") return null;
    const now = new Date();
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    const c = new Date(now);
    c.setDate(c.getDate() - days);
    return c.toISOString().slice(0, 10);
  }, [range]);

  const ranged = useMemo(
    () => (cutoff ? rows.filter((r) => r.date >= cutoff) : rows),
    [rows, cutoff],
  );

  // ── Latest value per (slug, platform) ────────────────────────────────
  const latest = useMemo(() => {
    const map = new Map<string, MetricsRow>();
    for (const r of ranged) {
      const key = `${r.slug}::${r.platform}`;
      const existing = map.get(key);
      if (!existing || r.date > existing.date) map.set(key, r);
    }
    return map;
  }, [ranged]);

  const groupKpi = (platform: string) =>
    latest.get(`__group__::${platform}`)?.count ?? null;

  const twitchCombined = useMemo(() => {
    let sum = 0;
    for (const m of members) {
      const v = latest.get(`${m.slug}::twitch`);
      if (v) sum += v.count;
    }
    return sum;
  }, [latest, members]);

  // ── Trend series for the selected metric ────────────────────────────
  // Twitch combined: sum every member's daily Twitch follower count.
  // Group platforms: read the __group__ row for that platform.
  const trend: TrendPoint[] = useMemo(() => {
    const buckets = new Map<string, number>();
    if (metric.key === "twitch-combined") {
      for (const r of ranged) {
        if (r.platform !== "twitch" || r.slug === "__group__") continue;
        buckets.set(r.date, (buckets.get(r.date) ?? 0) + r.count);
      }
    } else {
      for (const r of ranged) {
        if (r.platform !== metric.platform || r.slug !== "__group__") continue;
        buckets.set(r.date, r.count);
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }, [ranged, metric]);

  // ── Heatmap source: per-day delta vs prior day for the active series ─
  const heatmap: Map<string, HeatmapDay> = useMemo(() => {
    const map = new Map<string, HeatmapDay>();
    let prev: number | null = null;
    for (const p of trend) {
      const delta = prev == null ? 0 : p.value - prev;
      map.set(p.date, { date: p.date, value: p.value, delta });
      prev = p.value;
    }
    return map;
  }, [trend]);

  const accent = metric.brand;

  return (
    <div className="flex flex-col gap-8">
      {/* Range toggle + live pulse */}
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
            {r === "all" ? "All time" : r === "1d" ? "1 day" : r === "7d" ? "7 days" : "31 days"}
          </button>
        ))}
        {liveEntries.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-2 rounded-md border border-[color:var(--core)]/60 bg-[color:var(--core)]/12 px-3 py-1.5">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-[color:var(--core)] shadow-[0_0_8px_rgba(239,68,68,0.7)]"
              style={{ animation: "live-blink 1s ease-in-out infinite" }}
            />
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--core)]">
              LIVE · {liveEntries.length}
              {liveCombinedViewers > 0 ? ` · ${liveCombinedViewers.toLocaleString("en-US")} watching` : ""}
            </span>
          </span>
        ) : null}
      </div>

      {/* KPI grid — group-level (each linkable to its social) + Twitch combined */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Twitch combined"
          value={twitchCombined}
          unit="followers"
          accent={PLATFORM_COLOR.twitch!}
          platform="twitch"
        />
        <KpiCard
          label={GROUP.socials.youtube.handle}
          value={groupKpi("youtube")}
          unit="subs"
          accent={PLATFORM_COLOR.youtube!}
          platform="youtube"
          href={GROUP.socials.youtube.url}
        />
        <KpiCard
          label={GROUP.socials.tiktok.handle}
          value={groupKpi("tiktok")}
          unit="followers"
          accent={PLATFORM_COLOR.tiktok!}
          platform="tiktok"
          href={GROUP.socials.tiktok.url}
        />
        <KpiCard
          label={GROUP.socials.instagram.handle}
          value={groupKpi("instagram")}
          unit="followers"
          accent={PLATFORM_COLOR.instagram!}
          platform="instagram"
          href={GROUP.socials.instagram.url}
        />
        <KpiCard
          label={GROUP.socials.x.handle}
          value={groupKpi("x")}
          unit="followers"
          accent={PLATFORM_COLOR.x!}
          platform="x"
          href={GROUP.socials.x.url}
        />
      </section>

      {/* Chat-tracking stubs — Watch time and Concurrent peak are
          already covered downstream by Hours watched / Peak viewers in
          the stream-stats section, so they're not duplicated here. */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StubCard label="Chat messages" />
        <StubCard label="Unique chatters" />
      </section>

      {/* Trend chart — single platform pill row, brand-colored, with the
          chart for the active selection underneath. */}
      <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
        <header className="mb-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Growth trend
          </p>
          <h2 className="mt-1 text-[18px] font-bold tracking-tight text-[color:var(--ink)] md:text-[22px]">
            <span style={{ color: metric.brand }}>{metric.label}</span>
            <span className="ml-2 text-[color:var(--ink-dim)]">· {metric.subtitle}</span>
          </h2>
        </header>

        {/* Platform pill row — brand icon + label. Active pill is filled
            with the brand color; the rest stay surface-toned with a tinted
            border so the icons read but don't fight the chart. */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {METRICS.map((m) => {
            const active = m.key === metricKey;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricKey(m.key)}
                aria-pressed={active}
                className="group/pill inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold tracking-tight transition-all hover:-translate-y-px"
                style={
                  active
                    ? {
                        background: m.brand,
                        borderColor: m.brand,
                        color: m.platform === "x" ? "#0a0a0a" : "#fff",
                        boxShadow: `0 8px 20px -8px ${m.brand}99`,
                      }
                    : {
                        background: "transparent",
                        borderColor: `${m.brand}55`,
                        color: m.brand,
                      }
                }
              >
                <SocialIcon platform={m.platform} size={13} />
                {m.label}
              </button>
            );
          })}
        </div>

        <TrendLine data={trend} accent={accent} unit={metric.unit} />
      </section>

      {/* GitHub-style heatmap of daily deltas */}
      <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
        <header className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Daily growth · last year
          </p>
          <h2 className="mt-1 text-[18px] font-bold tracking-tight text-[color:var(--ink)] md:text-[22px]">
            One square per day. Brighter = bigger gain.
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] text-[color:var(--ink-dim)]">
            Visualises the day-over-day delta for the trend you&apos;ve selected
            above. Empty squares = no snapshot recorded that day.
          </p>
        </header>
        <HeatmapYear byDate={heatmap} accent={accent} colorBy="delta" year={2026} />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  accent,
  platform,
  href,
}: {
  label: string;
  value: number | null;
  unit: string;
  accent: string;
  platform: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  href?: string;
}) {
  const inner = (
    <>
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}18`, color: accent }}
      >
        <SocialIcon platform={platform} size={13} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: accent }}>
          {label}
        </span>
        <span className="mt-1.5 text-[24px] font-bold tabular-nums leading-none text-[color:var(--ink)] md:text-[28px]">
          {value == null ? "—" : value.toLocaleString("en-US")}
        </span>
        <span className="mt-1 text-[11px] text-[color:var(--ink-dim)]">{unit}</span>
      </span>
      {href ? (
        <ArrowUpRight
          size={14}
          className="shrink-0 self-start text-[color:var(--ink-faint)] transition-colors group-hover:text-[color:var(--ink)]"
        />
      ) : null}
    </>
  );
  const className =
    "group relative flex items-start gap-3 overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 transition-all";
  const style = { boxShadow: `inset 0 0 0 1px ${accent}1f` } as React.CSSProperties;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:-translate-y-px`}
        style={style}
      >
        {inner}
      </a>
    );
  }
  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}

function StubCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
        Coming once the Twitch IRC worker ships. Joins each member&apos;s chat
        and counts messages + unique chatters per hour.
      </p>
    </div>
  );
}

