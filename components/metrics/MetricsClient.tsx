"use client";

import { useMemo, useState } from "react";
import { HeatmapYear, type HeatmapDay } from "@/components/metrics/HeatmapYear";
import { TrendLine, type TrendPoint } from "@/components/metrics/TrendLine";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeToggle } from "@/components/metrics/RangeToggle";
import { SocialIcon } from "@/components/ui/SocialIcon";
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

function browserDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MetricsClient({ rows, members }: MetricsClientProps) {
  const [range, setRange] = useState<Range>("31d");
  const [metricKey, setMetricKey] = useState<Metric>("twitch-combined");
  const metric = METRICS.find((m) => m.key === metricKey)!;

  // Filter rows by range on the client. The /api/metrics endpoint can
  // also enforce range, but we always query "all" here so the toggle is
  // instant — no extra round-trip per click.
  const cutoff = useMemo(() => {
    if (range === "all") return null;
    const now = new Date();
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    const c = new Date(now);
    c.setDate(c.getDate() - days);
    return browserDateKey(c);
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
      {/* Section header — matches Stream Stats / Chat Stats so the
          range filters always live in the same spot top-right. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-secondary">
            Group totals · followers / subs
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">
            <span className="gradient-text">Snapshot</span> of every public account.
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

      {/* Trend chart — single platform pill row, brand-colored, with the
          chart for the active selection underneath. */}
      <section className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic md:p-6">
        <header className="mb-5">
          <p className="text-sm font-semibold text-brand-secondary">
            Growth trend
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary md:text-xl">
            <span style={{ color: metric.brand }}>{metric.label}</span>
            <span className="ml-2 text-tertiary">· {metric.subtitle}</span>
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
                className="group/pill inline-flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold tracking-tight transition-all hover:-translate-y-px"
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

      {trend.length === 0 ? (
        <p className="text-sm text-tertiary">
          Follower snapshots appear after the first collector run. Stream airtime above is independent.
        </p>
      ) : (
      <section className="rounded-xl bg-primary p-4 ring-1 ring-inset ring-secondary shadow-xs-skeuomorphic md:p-6">
        <header className="mb-4">
          <p className="text-sm font-semibold text-brand-secondary">
            Daily growth · {new Date().getFullYear()}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-primary md:text-xl">
            One square per day.
          </h2>
        </header>
        <HeatmapYear byDate={heatmap} accent={accent} colorBy="delta" year={new Date().getFullYear()} />
      </section>
      )}
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
  return (
    <MetricCard
      icon={<SocialIcon platform={platform} size={18} />}
      label={label}
      value={value == null ? "—" : value.toLocaleString("en-US")}
      unit={unit}
      accent={accent}
      href={href}
    />
  );
}
